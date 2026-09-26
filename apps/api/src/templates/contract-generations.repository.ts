import { ConflictException, Injectable } from "@nestjs/common";
import { AiGenerationStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { hasCompletePassportProfile } from "../files/document-policy";

const generationSelect = {
  attemptCount: true,
  clarificationAnswers: true,
  completedAt: true,
  createdAt: true,
  failedAt: true,
  failureCode: true,
  id: true,
  inputAnswers: true,
  providerMetadata: true,
  queuedAt: true,
  startedAt: true,
  status: true,
  structuredDraft: true,
  templateVersion: {
    select: {
      documentRequirements: {
        orderBy: { sortOrder: "asc" as const },
        select: { description: true, key: true, required: true, title: true },
      },
      template: { select: { slug: true, title: true } },
      questionnaireSchema: true,
      versionNumber: true,
    },
  },
  updatedAt: true,
  userId: true,
} satisfies Prisma.AiGenerationSelect;

export type ContractGenerationRecord = Prisma.AiGenerationGetPayload<{
  select: typeof generationSelect;
}>;

@Injectable()
export class ContractGenerationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async requireReadyParties(generation: ContractGenerationRecord, requestedDealId?: string) {
    const metadata = generation.providerMetadata as Record<string, unknown> | null;
    if (requestedDealId && metadata?.dealId && requestedDealId !== metadata.dealId) throw new ConflictException({ code: "DEAL_GENERATION_MISMATCH", message: "Сессия подготовки связана с другой сделкой" });
    const dealId = requestedDealId ?? (typeof metadata?.dealId === "string" ? metadata.dealId : undefined);
    const deal = await this.prisma.deal.findFirst({
      where: {
        ...(dealId ? { id: dealId } : { versions: { some: { OR: [
          { sourceGenerationId: generation.id },
          { terms: { path: ["clarificationSessionId"], equals: generation.id } },
        ] } } }),
        initiatorUserId: generation.userId,
        templateVersion: { aiGenerations: { some: { id: generation.id } } },
        status: { notIn: ["SIGNED_BY_ONE", "SIGNED", "COMPLETED", "CANCELED"] },
      },
      select: { id: true, parties: { select: { role: true, user: { select: {
        profile: { select: { firstName: true, lastName: true, middleName: true, birthDate: true, addressValue: true, passportDetails: true } },
      } } } } },
    });
    if (!deal || deal.parties.length !== 2 || deal.parties.some(party => !hasCompletePassportProfile(party.user.profile))) {
      throw new ConflictException({ code: "CONTRACT_PARTIES_NOT_READY", message: "Договор можно сформировать только после присоединения и заполнения реквизитов обеими сторонами" });
    }
    return { dealId: deal.id, names: Object.fromEntries(deal.parties.map(party => [party.role,
      [party.user.profile!.lastName, party.user.profile!.firstName, party.user.profile!.middleName].filter(Boolean).join(" "),
    ])) };
  }

  findOwned(
    id: string,
    templateSlug: string,
    userId: string,
  ): Promise<ContractGenerationRecord | null> {
    return this.prisma.aiGeneration.findFirst({
      select: generationSelect,
      where: {
        id,
        templateVersion: { template: { slug: templateSlug } },
        userId,
      },
    });
  }

  findForProcessing(id: string): Promise<ContractGenerationRecord | null> {
    return this.prisma.aiGeneration.findUnique({
      select: generationSelect,
      where: { id },
    });
  }

  async markQueued(id: string, metadata: Prisma.InputJsonObject): Promise<ContractGenerationRecord> {
    return this.prisma.aiGeneration.update({
      data: {
        completedAt: null,
        failedAt: null,
        failureCode: null,
        queuedAt: new Date(),
        startedAt: null,
        status: AiGenerationStatus.QUEUED,
        providerMetadata: metadata,
        structuredDraft: Prisma.DbNull,
      },
      select: generationSelect,
      where: { id },
    });
  }

  async markGenerating(
    id: string,
    attemptCount: number,
  ): Promise<ContractGenerationRecord> {
    return this.prisma.aiGeneration.update({
      data: {
        attemptCount,
        failedAt: null,
        failureCode: null,
        startedAt: new Date(),
        status: AiGenerationStatus.GENERATING,
      },
      select: generationSelect,
      where: { id },
    });
  }

  async markCompleted(input: {
    draft: Prisma.InputJsonObject;
    id: string;
    metadata: Prisma.InputJsonObject;
  }): Promise<ContractGenerationRecord> {
    return this.prisma.aiGeneration.update({
      data: {
        completedAt: new Date(),
        failedAt: null,
        failureCode: null,
        providerMetadata: input.metadata,
        status: AiGenerationStatus.COMPLETED,
        structuredDraft: input.draft,
      },
      select: generationSelect,
      where: { id: input.id },
    });
  }

  async markFailed(
    id: string,
    failureCode: string,
  ): Promise<ContractGenerationRecord> {
    return this.prisma.aiGeneration.update({
      data: {
        failedAt: new Date(),
        failureCode,
        status: AiGenerationStatus.FAILED,
      },
      select: generationSelect,
      where: { id },
    });
  }
}
