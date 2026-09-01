import type { UserTrustStatusResponse } from "@max-contract/contracts";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  TrustCheckSource,
  TrustCheckStatus,
  TrustCheckType,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

interface DesiredCheck {
  source: TrustCheckSource;
  status: TrustCheckStatus;
  type: TrustCheckType;
}

const CHECK_ORDER: TrustCheckType[] = [
  TrustCheckType.MAX_ACCOUNT,
  TrustCheckType.PHONE,
  TrustCheckType.REQUISITES_FORMAT,
  TrustCheckType.REQUIRED_FILES,
  TrustCheckType.INTERNAL_REVIEW,
];

@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string): Promise<UserTrustStatusResponse> {
    const user = await this.prisma.user.findUnique({
      select: {
        maxAccount: { select: { id: true } },
        phones: {
          orderBy: [{ isPrimary: "desc" }, { verifiedAt: "desc" }],
          select: { source: true },
          take: 1,
        },
        profile: {
          select: {
            addressSource: true,
            addressValue: true,
            birthDate: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "Пользователь не найден",
      });
    }

    const requisitesReady = Boolean(
      user.profile?.firstName.trim()
      && user.profile.lastName.trim()
      && user.profile.birthDate
      && user.profile.addressValue,
    );
    const desired: DesiredCheck[] = [
      {
        source: TrustCheckSource.MAX,
        status: user.maxAccount ? TrustCheckStatus.CONFIRMED : TrustCheckStatus.PENDING,
        type: TrustCheckType.MAX_ACCOUNT,
      },
      {
        source: user.phones[0]?.source === "DEV"
          ? TrustCheckSource.DEV
          : TrustCheckSource.MAX,
        status: user.phones[0] ? TrustCheckStatus.CONFIRMED : TrustCheckStatus.PENDING,
        type: TrustCheckType.PHONE,
      },
      {
        source: user.profile?.addressSource === "DADATA"
          ? TrustCheckSource.DADATA
          : TrustCheckSource.PROFILE,
        status: requisitesReady ? TrustCheckStatus.CONFIRMED : TrustCheckStatus.PENDING,
        type: TrustCheckType.REQUISITES_FORMAT,
      },
    ];

    const checks = await this.prisma.$transaction(async (transaction) => {
      for (const check of desired) {
        await syncComputedCheck(transaction, userId, check);
      }
      for (const type of [TrustCheckType.REQUIRED_FILES, TrustCheckType.INTERNAL_REVIEW]) {
        await transaction.userTrustCheck.upsert({
          create: {
            source: TrustCheckSource.SYSTEM,
            status: TrustCheckStatus.PENDING,
            type,
            userId,
          },
          update: {},
          where: { userId_type: { type, userId } },
        });
      }
      return transaction.userTrustCheck.findMany({ where: { userId } });
    });

    const items = CHECK_ORDER.map((type) => checks.find((check) => check.type === type))
      .filter((check): check is NonNullable<typeof check> => Boolean(check))
      .map((check) => ({
        checkedAt: check.checkedAt?.toISOString() ?? null,
        source: check.source,
        status: check.status,
        type: check.type,
        updatedAt: check.updatedAt.toISOString(),
      }));

    return {
      checks: items,
      confirmed: items.filter(({ status }) => status === "CONFIRMED").length,
      total: CHECK_ORDER.length,
    };
  }
}

async function syncComputedCheck(
  transaction: Prisma.TransactionClient,
  userId: string,
  desired: DesiredCheck,
): Promise<void> {
  const current = await transaction.userTrustCheck.findUnique({
    where: { userId_type: { type: desired.type, userId } },
  });
  if (current?.status === desired.status && current.source === desired.source) return;
  const checkedAt = desired.status === TrustCheckStatus.PENDING ? null : new Date();
  await transaction.userTrustCheck.upsert({
    create: { ...desired, checkedAt, userId },
    update: { checkedAt, source: desired.source, status: desired.status },
    where: { userId_type: { type: desired.type, userId } },
  });
}
