import type {
  ConfirmDealSignatureRequest,
  DealSigningStateResponse,
  IssueSigningOtpRequest,
  IssueSigningOtpResponse,
} from "@max-contract/contracts";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConsentSource,
  ConsentType,
  DealPartyRole,
  DealStatus,
  Prisma,
} from "@prisma/client";

import { DealArtifactsService, toSummary } from "../artifacts/deal-artifacts.service";
import { PrismaService } from "../database/prisma.service";
import { MaxBotService } from "../max-bot/max-bot.service";
import { OtpService } from "./otp.service";
import { pepAgreement } from "./pep-agreement";

const signingContextSelect = {
  artifacts: {
    orderBy: { createdAt: "desc" as const },
    take: 2,
  },
  id: true,
  parties: {
    select: {
      id: true,
      role: true,
      userId: true,
      user: {
        select: {
          maxAccount: { select: { firstName: true, lastName: true, maxUserId: true } },
          phones: {
            orderBy: [{ isPrimary: "desc" as const }, { verifiedAt: "desc" as const }],
            select: { e164: true, id: true },
            take: 1,
          },
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
  status: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: {
      contractNumber: true,
      frozenAt: true,
      id: true,
      signatures: { select: { partyId: true, signedAt: true, userId: true } },
      snapshotHash: true,
      versionNumber: true,
    },
    take: 1,
  },
} satisfies Prisma.DealSelect;

type SigningContext = Prisma.DealGetPayload<{ select: typeof signingContextSelect }>;

@Injectable()
export class SigningService {
  private readonly pepVersion: string;

  constructor(
    config: ConfigService,
    private readonly artifacts: DealArtifactsService,
    private readonly maxBot: MaxBotService,
    private readonly otp: OtpService,
    private readonly prisma: PrismaService,
  ) {
    this.pepVersion = config.getOrThrow<string>("CONSENT_ELECTRONIC_SIGNATURE_VERSION");
  }

  async state(userId: string, dealId: string): Promise<DealSigningStateResponse> {
    return toState(await this.loadContext(userId, dealId), userId, this.pepVersion);
  }

  async issueOtp(
    userId: string,
    dealId: string,
    input: IssueSigningOtpRequest,
    requestId?: string,
  ): Promise<IssueSigningOtpResponse> {
    const context = await this.loadContext(userId, dealId);
    const version = requireFrozenVersion(context, input.versionId);
    assertSigningOpen(context.status);
    const party = requireParty(context, userId);
    if (version.signatures.some((signature) => signature.partyId === party.id)) {
      throw new ConflictException({ code: "DEAL_ALREADY_SIGNED", message: "Вы уже подписали эту версию" });
    }
    const phone = party.user.phones[0];
    if (!phone) throw signingProfileRequired();
    const agreement = pepAgreement(this.pepVersion);
    await this.prisma.$transaction([
      this.prisma.userConsent.upsert({
        create: {
          documentHash: agreement.documentHash,
          documentVersion: agreement.version,
          granted: true,
          source: ConsentSource.MINI_APP,
          type: ConsentType.ELECTRONIC_SIGNATURE,
          userId,
        },
        update: {
          documentHash: agreement.documentHash,
          granted: true,
          recordedAt: new Date(),
          source: ConsentSource.MINI_APP,
        },
        where: {
          userId_type_documentVersion: {
            documentVersion: agreement.version,
            type: ConsentType.ELECTRONIC_SIGNATURE,
            userId,
          },
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: version.id,
          entityType: "DealVersion",
          eventType: "PEP_CONSENT_ACCEPTED",
          metadata: {
            dealId,
            documentHash: agreement.documentHash,
            documentVersion: agreement.version,
            snapshotHash: version.snapshotHash,
          },
          requestId,
        },
      }),
    ]);
    const issued = await this.otp.issue({
      dealId,
      maxUserId: party.user.maxAccount?.maxUserId ?? null,
      phone: phone.e164,
      phoneId: phone.id,
      userId,
      versionId: version.id,
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: userId,
        entityId: version.id,
        entityType: "DealVersion",
        eventType: "SIGNING_OTP_SENT",
        metadata: { channel: issued.channel, dealId, versionNumber: version.versionNumber },
        requestId,
      },
    });
    return issued;
  }

  async confirm(
    userId: string,
    dealId: string,
    input: ConfirmDealSignatureRequest,
    contextData: { ipAddress: string | null; requestId?: string; userAgent: string | null },
  ): Promise<DealSigningStateResponse> {
    const context = await this.loadContext(userId, dealId);
    const version = requireFrozenVersion(context, input.versionId);
    assertSigningOpen(context.status);
    const party = requireParty(context, userId);
    if (version.signatures.some((signature) => signature.partyId === party.id)) {
      if (version.signatures.length >= context.parties.length) await this.artifacts.ensureFinalPdf(dealId);
      if (version.signatures.length >= context.parties.length) await this.artifacts.ensureEvidencePackage(dealId);
      return this.state(userId, dealId);
    }

    let verified: Awaited<ReturnType<OtpService["verify"]>>;
    try {
      verified = await this.otp.verify({ code: input.code, dealId, userId, versionId: version.id });
    } catch (error) {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: version.id,
          entityType: "DealVersion",
          eventType: "SIGNING_OTP_FAILED",
          metadata: { dealId, result: errorCode(error), versionNumber: version.versionNumber },
          requestId: contextData.requestId,
        },
      });
      throw error;
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.dealSignature.findUnique({
        where: { dealVersionId_partyId: { dealVersionId: version.id, partyId: party.id } },
      });
      if (existing) return existing;
      const signature = await transaction.dealSignature.create({
        data: {
          dealId,
          dealVersionId: version.id,
          documentHash: version.snapshotHash,
          ipAddress: contextData.ipAddress,
          maxUserIdRef: party.user.maxAccount?.maxUserId ?? null,
          otpChannel: verified.channel,
          partyId: party.id,
          pepDocumentVersion: this.pepVersion,
          providerMessageId: verified.messageId,
          signedAt: now,
          userAgent: contextData.userAgent,
          userId,
          verifiedPhoneId: verified.phoneId,
        },
      });
      const total = await transaction.dealSignature.count({ where: { dealVersionId: version.id } });
      const nextStatus = total >= context.parties.length ? DealStatus.SIGNED : DealStatus.SIGNED_BY_ONE;
      const updated = await transaction.deal.updateMany({
        data: { status: nextStatus, updatedAt: now },
        where: { id: dealId, status: { in: [DealStatus.READY_TO_SIGN, DealStatus.SIGNED_BY_ONE] } },
      });
      if (updated.count !== 1) throw signingConflict();
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: signature.id,
          entityType: "DealSignature",
          eventType: "DEAL_VERSION_SIGNED_WITH_PEP",
          metadata: {
            dealId,
            documentHash: version.snapshotHash,
            ipAddress: contextData.ipAddress,
            maxUserIdReference: party.user.maxAccount?.maxUserId ?? null,
            otpChannel: verified.channel,
            otpResult: "VERIFIED",
            userAgent: contextData.userAgent,
            verifiedPhoneReference: verified.phoneId,
            versionId: version.id,
            versionNumber: version.versionNumber,
          },
          requestId: contextData.requestId,
        },
      });
      return signature;
    });

    for (const other of context.parties.filter(({ userId: id }) => id !== userId)) {
      void this.maxBot.sendUserNotification(
        other.user.maxAccount?.maxUserId ?? "",
        context.parties.length === version.signatures.length + 1
          ? "Договор подписан обеими сторонами. Готовим итоговый документ."
          : "Вторая сторона подписала договор. Откройте сделку, чтобы поставить свою подпись.",
      );
    }
    void result;
    const nextState = await this.state(userId, dealId);
    if (nextState.totalSignatures >= nextState.requiredSignatures) {
      await this.artifacts.ensureFinalPdf(dealId);
      await this.artifacts.ensureEvidencePackage(dealId);
      return this.state(userId, dealId);
    }
    return nextState;
  }

  private async loadContext(userId: string, dealId: string): Promise<SigningContext> {
    const context = await this.prisma.deal.findFirst({
      select: signingContextSelect,
      where: { id: dealId, parties: { some: { userId } } },
    });
    if (!context) throw dealNotFound();
    return context;
  }
}

function requireFrozenVersion(context: SigningContext, expectedVersionId?: string) {
  const version = context.versions[0];
  if (
    !version || !version.frozenAt || !version.snapshotHash || !version.contractNumber ||
    (expectedVersionId && version.id !== expectedVersionId)
  ) throw signingConflict();
  return version as typeof version & { contractNumber: string; snapshotHash: string };
}

function requireParty(context: SigningContext, userId: string) {
  const party = context.parties.find(({ userId: id }) => id === userId);
  if (!party) throw dealNotFound();
  if (!party.user.profile || !party.user.phones[0]) throw signingProfileRequired();
  return party;
}

function assertSigningOpen(status: DealStatus): void {
  if (status === DealStatus.READY_TO_SIGN || status === DealStatus.SIGNED_BY_ONE) return;
  if (status === DealStatus.SIGNED || status === DealStatus.COMPLETED) return;
  throw new ConflictException({
    code: "DEAL_SIGNING_NOT_READY",
    message: "Сделка ещё не готова к подписанию",
  });
}

function toState(context: SigningContext, userId: string, pepVersion: string): DealSigningStateResponse {
  const version = requireFrozenVersion(context);
  const signatures = new Map(version.signatures.map((signature) => [signature.partyId, signature]));
  const finalPdf = context.artifacts.find(({ type }) => type === "FINAL_PDF");
  const evidencePackage = context.artifacts.find(({ type }) => type === "EVIDENCE_ZIP");
  return {
    contractNumber: version.contractNumber,
    currentUserSigned: version.signatures.some((signature) => signature.userId === userId),
    dealId: context.id,
    documentHash: version.snapshotHash,
    evidencePackage: evidencePackage ? toSummary(evidencePackage) : null,
    finalPdf: finalPdf ? toSummary(finalPdf) : null,
    parties: [...context.parties]
      .sort((left, right) => left.role === DealPartyRole.INITIATOR ? -1 : right.role === DealPartyRole.INITIATOR ? 1 : 0)
      .map((party) => ({
        displayName: displayName(party.user),
        isCurrentUser: party.userId === userId,
        role: party.role,
        signedAt: signatures.get(party.id)?.signedAt.toISOString() ?? null,
      })),
    pepAgreement: pepAgreement(pepVersion),
    requiredSignatures: context.parties.length,
    status: context.status,
    totalSignatures: version.signatures.length,
    versionId: version.id,
    versionNumber: version.versionNumber,
  };
}

function displayName(user: SigningContext["parties"][number]["user"]): string {
  const profile = user.profile ?? user.maxAccount;
  return [profile?.lastName, profile?.firstName].filter(Boolean).join(" ") || "Участник сделки";
}

function errorCode(error: unknown): string {
  if (!(error instanceof HttpException)) return "OTP_ERROR";
  const response = error.getResponse();
  return typeof response === "object" && response !== null && "code" in response && typeof response.code === "string"
    ? response.code
    : "OTP_ERROR";
}

function signingConflict(): ConflictException {
  return new ConflictException({
    code: "DEAL_SIGNING_VERSION_CONFLICT",
    message: "Версия договора изменилась. Обновите сделку",
  });
}

function signingProfileRequired(): ForbiddenException {
  return new ForbiddenException({
    code: "DEAL_SIGNING_PROFILE_REQUIRED",
    message: "Для подписания заполните профиль и подтвердите телефон",
  });
}

function dealNotFound(): NotFoundException {
  return new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Сделка не найдена" });
}
