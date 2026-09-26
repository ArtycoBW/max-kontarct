import { ConflictException, Injectable } from "@nestjs/common";
import {
  AiGenerationStatus,
  DealApprovalStatus,
  DealPartyRole,
  DealStatus,
  Prisma,
  TemplateVersionStatus,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { loadDocumentStage } from "../files/document-readiness";
import { hasCompletePassportProfile } from "../files/document-policy";

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
  parties: { select: { userId: true, user: { select: { profile: { select: { lastName: true } } } } } },
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

  async findCompletedGeneration(input: {
    dealId: string;
    id: string;
    templateVersionId: string;
    userId: string;
  }) {
    const generation = await this.prisma.aiGeneration.findFirst({
      select: { id: true, inputAnswers: true, structuredDraft: true, providerMetadata: true },
      where: {
        id: input.id,
        status: AiGenerationStatus.COMPLETED,
        templateVersionId: input.templateVersionId,
        userId: input.userId,
      },
    });
    if (!generation) return null;
    const metadata = generation.providerMetadata as Record<string, unknown> | null;
    if (metadata?.dealId && metadata.dealId !== input.dealId) throw new ConflictException({ code: "DEAL_GENERATION_MISMATCH", message: "Проект подготовлен для другой сделки" });
    const parties = await this.prisma.dealParty.findMany({ where: { dealId: input.dealId }, select: { role: true, user: { select: { profile: true } } } });
    if (parties.length !== 2 || parties.some(party => !hasCompletePassportProfile(party.user.profile))) throw new ConflictException({ code: "CONTRACT_PARTIES_NOT_READY", message: "Сначала обе стороны должны заполнить реквизиты" });
    const names = metadata?.partyNames as Record<string, string> | undefined;
    if (names && parties.some(party => names[party.role] !== [party.user.profile!.lastName, party.user.profile!.firstName, party.user.profile!.middleName].filter(Boolean).join(" "))) {
      throw new ConflictException({ code: "DEAL_PARTY_DETAILS_CHANGED", message: "ФИО участника изменилось. Сформируйте договор заново" });
    }
    return generation;
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

      // The guarded update above holds the deal row lock. An early join either
      // finishes before it (visible here), or retries against the new status.
      const joined = await transaction.dealParty.count({ where: { dealId: input.dealId, role: DealPartyRole.COUNTERPARTY } });
      const activeInvitation = await transaction.dealInvitation.count({ where: { dealId: input.dealId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (joined || activeInvitation) {
        const status = joined ? await loadDocumentStage(transaction, input.dealId) : DealStatus.INVITATION_READY;
        await transaction.deal.update({ where: { id: input.dealId }, data: { status } });
      }

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
      const documentStages: DealStatus[] = [DealStatus.COUNTERPARTY_JOINED, DealStatus.DOCUMENTS_PENDING, DealStatus.DOCUMENTS_REVIEW, DealStatus.TERMS_REVIEW];
      if (documentStages.includes(input.nextStatus)) {
        const status = await loadDocumentStage(transaction, input.dealId);
        await transaction.deal.update({ where: { id: input.dealId }, data: { status } });
      }
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
