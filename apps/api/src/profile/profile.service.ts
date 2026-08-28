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
