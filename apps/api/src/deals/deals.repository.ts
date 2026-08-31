import { Injectable } from "@nestjs/common";
import {
  AiGenerationStatus,
  DealApprovalStatus,
  DealPartyRole,
  DealStatus,
  Prisma,
  TemplateVersionStatus,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

const dealDraftSelect = {
  createdAt: true,
  id: true,
  initiatorUserId: true,
  status: true,
  templateVersion: {
    select: {
      id: true,
      template: { select: { slug: true, title: true } },
      versionNumber: true,
    },
  },
  title: true,
  updatedAt: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: {
      contractDraft: true,
      id: true,
      sourceGenerationId: true,
      terms: true,
      versionNumber: true,
    },
    take: 1,
  },
} satisfies Prisma.DealSelect;

const dealListSelect = {
  id: true,
  status: true,
  templateVersion: { select: { template: { select: { title: true } } } },
  title: true,
  updatedAt: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: { versionNumber: true },
    take: 1,
  },
} satisfies Prisma.DealSelect;

const dealVersionHistorySelect = {
  approvals: { select: { status: true } },
  changeSummary: true,
  createdAt: true,
  id: true,
  versionNumber: true,
} satisfies Prisma.DealVersionSelect;

export type DealDraftRecord = Prisma.DealGetPayload<{
  select: typeof dealDraftSelect;
}>;

export type DealListRecord = Prisma.DealGetPayload<{
  select: typeof dealListSelect;
}>;

export type DealVersionHistoryRecord = Prisma.DealVersionGetPayload<{
  select: typeof dealVersionHistorySelect;
}>;

@Injectable()
export class DealsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublishedTemplateVersion(id: string) {
    return this.prisma.contractTemplateVersion.findFirst({
      select: {
        id: true,
        template: { select: { slug: true, title: true } },
        versionNumber: true,
      },
      where: { id, status: TemplateVersionStatus.PUBLISHED },
    });
  }

  findInitiator(userId: string) {
    return this.prisma.user.findUnique({
      select: {
        maxAccount: {
          select: { firstName: true, lastName: true },
        },
        phones: {
          orderBy: [{ isPrimary: "desc" as const }, { verifiedAt: "desc" as const }],
          select: { e164: true },
          take: 1,
        },
        profile: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
      },
      where: { id: userId },
    });
  }

  createDraft(input: {
    initiatorUserId: string;
    templateVersionId: string;
    terms: Prisma.InputJsonObject;
    title: string;
  }): Promise<DealDraftRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const deal = await transaction.deal.create({
        data: {
          initiatorUserId: input.initiatorUserId,
          parties: {
            create: {
              role: DealPartyRole.INITIATOR,
              userId: input.initiatorUserId,
            },
          },
          templateVersionId: input.templateVersionId,
          title: input.title,
          versions: {
            create: {
              createdByUserId: input.initiatorUserId,
              terms: input.terms,
              versionNumber: 1,
            },
          },
        },
        select: dealDraftSelect,
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: input.initiatorUserId,
          entityId: deal.id,
          entityType: "Deal",
          eventType: "DEAL_DRAFT_CREATED",
          metadata: { templateVersionId: input.templateVersionId },
        },
      });
      return deal;
    });
  }

  findOwnedDraft(id: string, userId: string): Promise<DealDraftRecord | null> {
    return this.prisma.deal.findFirst({
      select: dealDraftSelect,
      where: { id, parties: { some: { userId } } },
    });
  }

  findVersionHistory(
    id: string,
    userId: string,
  ): Promise<DealVersionHistoryRecord[] | null> {
    return this.prisma.deal
      .findFirst({
        select: {
          versions: {
            orderBy: { versionNumber: "desc" },
            select: dealVersionHistorySelect,
          },
        },
        where: { id, parties: { some: { userId } } },
      })
      .then((deal) => deal?.versions ?? null);
  }

  listOwned(userId: string): Promise<DealListRecord[]> {
    return this.prisma.deal.findMany({
      orderBy: { updatedAt: "desc" },
      select: dealListSelect,
      where: { parties: { some: { userId } } },
    });
  }

  findCompletedGeneration(input: {
    id: string;
    templateVersionId: string;
    userId: string;
  }) {
    return this.prisma.aiGeneration.findFirst({
      select: { id: true, inputAnswers: true, structuredDraft: true },
      where: {
        id: input.id,
        status: AiGenerationStatus.COMPLETED,
        templateVersionId: input.templateVersionId,
        userId: input.userId,
      },
    });
  }

  startAgreement(input: {
    dealId: string;
    expectedUpdatedAt: Date;
    expectedVersionId: string;
    nextStatus: DealStatus;
    userId: string;
    versionNumber: number;
  }): Promise<DealDraftRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.deal.updateMany({
        data: { status: input.nextStatus, updatedAt: new Date() },
        where: {
          id: input.dealId,
          initiatorUserId: input.userId,
          status: DealStatus.DRAFT,
          updatedAt: input.expectedUpdatedAt,
          versions: { some: { id: input.expectedVersionId } },
        },
      });
      if (updated.count !== 1) return null;

      await transaction.auditEvent.create({
        data: {
          actorUserId: input.userId,
          entityId: input.dealId,
          entityType: "Deal",
          eventType: "DEAL_AGREEMENT_STARTED",
          metadata: {
            versionId: input.expectedVersionId,
            versionNumber: input.versionNumber,
          },
        },
      });
      return transaction.deal.findUnique({
        select: dealDraftSelect,
        where: { id: input.dealId },
      });
    });
  }

  createVersion(input: {
    changeSummary: string;
    contractDraft: Prisma.InputJsonValue;
    currentStatus: DealStatus;
    currentVersionId: string;
    dealId: string;
    expectedUpdatedAt: Date;
    nextStatus: DealStatus;
    sourceGenerationId: string;
    terms: Prisma.InputJsonObject;
    userId: string;
    versionNumber: number;
  }): Promise<DealDraftRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.deal.updateMany({
        data: { status: input.nextStatus, updatedAt: new Date() },
        where: {
          id: input.dealId,
          initiatorUserId: input.userId,
          status: input.currentStatus,
          updatedAt: input.expectedUpdatedAt,
          versions: { some: { id: input.currentVersionId } },
        },
      });
      if (updated.count !== 1) return null;

      const createdVersion = await transaction.dealVersion.create({
        data: {
          changeSummary: input.changeSummary,
          contractDraft: input.contractDraft,
          createdByUserId: input.userId,
          dealId: input.dealId,
          sourceGenerationId: input.sourceGenerationId,
          terms: input.terms,
          versionNumber: input.versionNumber,
        },
        select: { id: true },
      });
      const invalidated = await transaction.dealApproval.updateMany({
        data: {
          invalidatedAt: new Date(),
          status: DealApprovalStatus.SUPERSEDED,
        },
        where: {
          dealId: input.dealId,
          status: DealApprovalStatus.APPROVED,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: input.userId,
          entityId: input.dealId,
          entityType: "Deal",
          eventType: "DEAL_VERSION_CREATED",
          metadata: {
            invalidatedApprovals: invalidated.count,
            previousVersionId: input.currentVersionId,
            versionId: createdVersion.id,
            versionNumber: input.versionNumber,
          },
        },
      });
      return transaction.deal.findUnique({
        select: dealDraftSelect,
        where: { id: input.dealId },
      });
    });
  }

  updateDraft(input: {
    contractDraft?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    dealId: string;
    expectedUpdatedAt: Date;
    sourceGenerationId?: string | null;
    terms: Prisma.InputJsonObject;
    title: string;
    userId: string;
    versionId: string;
  }): Promise<DealDraftRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.deal.updateMany({
        data: { title: input.title, updatedAt: new Date() },
        where: {
          id: input.dealId,
          initiatorUserId: input.userId,
          status: DealStatus.DRAFT,
          updatedAt: input.expectedUpdatedAt,
        },
      });
      if (updated.count !== 1) return null;

      await transaction.dealVersion.update({
        data: {
          ...(input.contractDraft !== undefined
            ? { contractDraft: input.contractDraft }
            : {}),
          ...(input.sourceGenerationId !== undefined
            ? { sourceGenerationId: input.sourceGenerationId }
            : {}),
          terms: input.terms,
        },
        where: { id: input.versionId },
      });
      return transaction.deal.findUnique({
        select: dealDraftSelect,
        where: { id: input.dealId },
      });
    });
  }
}
