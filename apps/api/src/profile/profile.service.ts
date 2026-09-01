import type {
  UpdateUserProfileRequest,
  UserProfileResponse,
  VerifiedPhone,
} from "@max-contract/contracts";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      include: {
        maxAccount: true,
        phones: {
          orderBy: [{ isPrimary: "desc" }, { verifiedAt: "desc" }],
          take: 1,
        },
        profile: true,
      },
      where: { id: userId },
    });

    if (!user?.maxAccount) {
      throw new NotFoundException({
        code: "PROFILE_NOT_FOUND",
        message: "Профиль пользователя не найден",
      });
    }

    const phone = user.phones[0];
    const verifiedPhone = phone
      ? ({
          e164: phone.e164,
          source: phone.source,
          verifiedAt: phone.verifiedAt.toISOString(),
        } satisfies VerifiedPhone)
      : null;

    return {
      address: user.profile?.addressValue
        ? {
            city: user.profile.addressCity,
            fiasId: user.profile.addressFiasId,
            house: user.profile.addressHouse,
            kladrId: user.profile.addressKladrId,
            postalCode: user.profile.addressPostalCode,
            qualityCode: user.profile.addressQualityCode,
            region: user.profile.addressRegion,
            source: user.profile.addressSource === "DADATA" ? "DADATA" : "MOCK",
            street: user.profile.addressStreet,
            value: user.profile.addressValue,
          }
        : null,
      birthDate: user.profile?.birthDate
        ? toDateOnly(user.profile.birthDate)
        : null,
      email: user.profile?.email ?? null,
      firstName: user.profile?.firstName ?? user.maxAccount.firstName ?? "",
      lastName: user.profile?.lastName ?? user.maxAccount.lastName ?? "",
      maxUsername: user.maxAccount.username,
      middleName: user.profile?.middleName ?? null,
      phone: verifiedPhone,
      updatedAt: user.profile?.updatedAt.toISOString() ?? null,
    };
  }

  async updateProfile(
    userId: string,
    input: UpdateUserProfileRequest,
    requestId?: string,
  ): Promise<UserProfileResponse> {
    const normalized = normalizeProfile(input);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userProfile.upsert({
        create: { ...normalized, userId },
        update: normalized,
        where: { userId },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: userId,
          entityId: userId,
          entityType: "UserProfile",
          eventType: "USER_PROFILE_UPDATED",
          metadata: {
            changedFields: [
              "firstName",
              "lastName",
              "middleName",
              "birthDate",
              "email",
              "address",
            ],
          },
          requestId,
        },
      });
    });

    return this.getProfile(userId);
  }
}

function normalizeProfile(input: UpdateUserProfileRequest) {
  const birthDate = input.birthDate
    ? new Date(`${input.birthDate}T00:00:00.000Z`)
    : null;
  if (birthDate) {
    const now = new Date();
    if (
      Number.isNaN(birthDate.getTime()) ||
      birthDate.getUTCFullYear() < 1900 ||
      birthDate.getTime() > now.getTime()
    ) {
      throw new BadRequestException({
        code: "PROFILE_BIRTH_DATE_INVALID",
        message: "Укажите корректную дату рождения",
      });
    }
  }

  return {
    addressCity: input.address?.city ?? null,
    addressFiasId: input.address?.fiasId ?? null,
    addressHouse: input.address?.house ?? null,
    addressKladrId: input.address?.kladrId ?? null,
    addressNormalizedAt: input.address ? new Date() : null,
    addressPostalCode: input.address?.postalCode ?? null,
    addressQualityCode: input.address?.qualityCode ?? null,
    addressRegion: input.address?.region ?? null,
    addressSource: input.address?.source ?? null,
    addressStreet: input.address?.street ?? null,
    addressValue: input.address?.value.trim() ?? null,
    birthDate,
    email: input.email?.trim().toLowerCase() || null,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    middleName: input.middleName?.trim() || null,
  };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
