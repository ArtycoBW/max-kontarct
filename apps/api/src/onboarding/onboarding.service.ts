import type {
  AuthUser,
  ConsentStatus,
  ConsentType as ContractConsentType,
  MaxContactRequest,
  OnboardingStateResponse,
  RecordConsentsRequest,
  VerifiedPhone,
} from "@max-contract/contracts";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConsentSource,
  ConsentType,
  PhoneVerificationSource,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { MaxContactVerifier, normalizePhone } from "./max-contact.verifier";

interface ConsentDefinition {
  required: boolean;
  type: ConsentType;
  version: string;
}

@Injectable()
export class OnboardingService {
  private readonly consentDefinitions: ConsentDefinition[];
  private readonly devPhone: string;
  private readonly nodeEnv: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly contactVerifier: MaxContactVerifier,
  ) {
    this.nodeEnv = config.getOrThrow<string>("NODE_ENV");
    this.devPhone = config.getOrThrow<string>("DEV_MAX_PHONE");
    this.consentDefinitions = [
      {
        required: true,
        type: ConsentType.PERSONAL_DATA,
        version: config.getOrThrow<string>(
          "CONSENT_PERSONAL_DATA_VERSION",
        ),
      },
      {
        required: true,
        type: ConsentType.TERMS_OF_USE,
        version: config.getOrThrow<string>("CONSENT_TERMS_VERSION"),
      },
      {
        required: false,
        type: ConsentType.STATUS_NOTIFICATIONS,
        version: config.getOrThrow<string>(
          "CONSENT_STATUS_NOTIFICATIONS_VERSION",
        ),
      },
    ];
  }

  async getState(userId: string): Promise<OnboardingStateResponse> {
    const [consents, phone] = await Promise.all([
      this.prisma.userConsent.findMany({
        where: {
          OR: this.consentDefinitions.map(({ type, version }) => ({
            documentVersion: version,
            type,
          })),
          userId,
        },
      }),
      this.prisma.userPhone.findFirst({
        orderBy: [{ isPrimary: "desc" }, { verifiedAt: "desc" }],
        where: { userId },
      }),
    ]);

    const consentState = this.consentDefinitions.map((definition) => ({
      granted:
        consents.find(
          (consent) =>
            consent.type === definition.type &&
            consent.documentVersion === definition.version,
        )?.granted ?? false,
      required: definition.required,
      type: definition.type as ContractConsentType,
      version: definition.version,
    }));
    const requiredConsentsAccepted = consentState
      .filter(({ required }) => required)
      .every(({ granted }) => granted);
    const verifiedPhone = phone
      ? ({
          e164: phone.e164,
          source: phone.source,
          verifiedAt: phone.verifiedAt.toISOString(),
        } satisfies VerifiedPhone)
      : null;

    return {
      completed: requiredConsentsAccepted && Boolean(verifiedPhone),
      consents: consentState satisfies ConsentStatus[],
      phone: verifiedPhone,
      phoneVerified: Boolean(verifiedPhone),
      requiredConsentsAccepted,
    };
  }

  async recordConsents(
    userId: string,
    input: RecordConsentsRequest,
    requestId?: string,
  ): Promise<OnboardingStateResponse> {
    if (!input.personalData || !input.termsOfUse) {
      throw new BadRequestException({
        code: "REQUIRED_CONSENTS_MISSING",
        message: "Подтвердите обязательные условия",
      });
    }

    const grantedByType = new Map<ConsentType, boolean>([
      [ConsentType.PERSONAL_DATA, input.personalData],
      [ConsentType.TERMS_OF_USE, input.termsOfUse],
      [ConsentType.STATUS_NOTIFICATIONS, input.statusNotifications],
    ]);

    await this.prisma.$transaction(async (transaction) => {
      for (const definition of this.consentDefinitions) {
        await transaction.userConsent.upsert({
          create: {
            documentVersion: definition.version,
            granted: grantedByType.get(definition.type) ?? false,
            source: ConsentSource.MINI_APP,
            type: definition.type,
            userId,
          },
          update: {
            granted: grantedByType.get(definition.type) ?? false,
            recordedAt: new Date(),
            source: ConsentSource.MINI_APP,
          },
          where: {
            userId_type_documentVersion: {
              documentVersion: definition.version,
              type: definition.type,
              userId,
            },
          },
        });
      }

      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: userId,
          entityType: "User",
          eventType: "ONBOARDING_CONSENTS_RECORDED",
          metadata: {
            consents: this.consentDefinitions.map(({ type, version }) => ({
              granted: grantedByType.get(type) ?? false,
              type,
              version,
            })),
          },
          requestId,
        },
      });
    });

    return this.getState(userId);
  }

  async verifyMaxPhone(
    user: AuthUser,
    contact: MaxContactRequest,
    requestId?: string,
  ): Promise<OnboardingStateResponse> {
    const e164 = this.contactVerifier.verify(
      contact,
      user.maxAccount.maxUserId,
    );
    await this.storePhone(
      user.id,
      e164,
      PhoneVerificationSource.MAX,
      requestId,
    );
    return this.getState(user.id);
  }

  async verifyDevelopmentPhone(
    userId: string,
    requestId?: string,
  ): Promise<OnboardingStateResponse> {
    if (this.nodeEnv === "production") {
      throw new NotFoundException();
    }

    await this.storePhone(
      userId,
      normalizePhone(this.devPhone),
      PhoneVerificationSource.DEV,
      requestId,
    );
    return this.getState(userId);
  }

  private async storePhone(
    userId: string,
    e164: string,
    source: PhoneVerificationSource,
    requestId?: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const occupied = await transaction.userPhone.findUnique({
          where: { e164 },
        });
        if (occupied && occupied.userId !== userId) {
          throw phoneConflict();
        }

        await transaction.userPhone.updateMany({
          data: { isPrimary: false },
          where: { isPrimary: true, userId },
        });
        const phone = await transaction.userPhone.upsert({
          create: {
            e164,
            isPrimary: true,
            source,
            userId,
            verifiedAt: new Date(),
          },
          update: {
            isPrimary: true,
            source,
            verifiedAt: new Date(),
          },
          where: { e164 },
        });

        await transaction.auditEvent.create({
          data: {
            actorUserId: userId,
            entityId: phone.id,
            entityType: "UserPhone",
            eventType:
              source === PhoneVerificationSource.MAX
                ? "MAX_PHONE_VERIFIED"
                : "DEV_PHONE_VERIFIED",
            metadata: { source },
            requestId,
          },
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw phoneConflict();
      }
      throw error;
    }
  }
}

function phoneConflict(): ConflictException {
  return new ConflictException({
    code: "PHONE_ALREADY_IN_USE",
    message: "Этот номер уже связан с другим профилем",
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
