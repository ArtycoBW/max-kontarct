import { Injectable } from "@nestjs/common";
import { AiGenerationStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

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

  async markQueued(id: string): Promise<ContractGenerationRecord> {
    return this.prisma.aiGeneration.update({
      data: {
        completedAt: null,
        failedAt: null,
        failureCode: null,
        queuedAt: new Date(),
        startedAt: null,
        status: AiGenerationStatus.QUEUED,
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
