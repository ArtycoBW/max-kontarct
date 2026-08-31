import { Injectable } from "@nestjs/common";
import { AiGenerationStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

const clarificationSelect = {
  clarificationAnswers: true,
  createdAt: true,
  id: true,
  inputAnswers: true,
  providerMetadata: true,
  questions: true,
  status: true,
  templateVersion: {
    select: {
      template: { select: { slug: true, title: true } },
      versionNumber: true,
    },
  },
  templateVersionId: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.AiGenerationSelect;

export type AiClarificationRecord = Prisma.AiGenerationGetPayload<{
  select: typeof clarificationSelect;
}>;

@Injectable()
export class AiClarificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    inputAnswers: Prisma.InputJsonObject;
    metadata: Prisma.InputJsonObject;
    promptId: string;
    promptVersion: string;
    questions: Prisma.InputJsonArray;
    status: AiGenerationStatus;
    templateVersionId: string;
    userId: string;
  }): Promise<AiClarificationRecord> {
    return this.prisma.aiGeneration.create({
      data: {
        completedAt:
          input.status === AiGenerationStatus.READY_TO_GENERATE
            ? new Date()
            : null,
        inputAnswers: input.inputAnswers,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        providerMetadata: input.metadata,
        questions: input.questions,
        status: input.status,
        templateVersionId: input.templateVersionId,
        userId: input.userId,
      },
      select: clarificationSelect,
    });
  }

  findOwned(
    id: string,
    templateSlug: string,
    userId: string,
  ): Promise<AiClarificationRecord | null> {
    return this.prisma.aiGeneration.findFirst({
      select: clarificationSelect,
      where: {
        id,
        templateVersion: { template: { slug: templateSlug } },
        userId,
      },
    });
  }

  update(input: {
    answers: Prisma.InputJsonObject;
    id: string;
    metadata: Prisma.InputJsonObject;
    questions: Prisma.InputJsonArray;
    status: AiGenerationStatus;
  }): Promise<AiClarificationRecord> {
    return this.prisma.aiGeneration.update({
      data: {
        clarificationAnswers: input.answers,
        completedAt:
          input.status === AiGenerationStatus.READY_TO_GENERATE
            ? new Date()
            : null,
        providerMetadata: input.metadata,
        questions: input.questions,
        status: input.status,
      },
      select: clarificationSelect,
      where: { id: input.id },
    });
  }
}
