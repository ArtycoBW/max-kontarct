import type { ContractStructuredDraft } from "@max-contract/contracts";
import { Injectable } from "@nestjs/common";
import { AiGenerationStatus, type Prisma } from "@prisma/client";
import type { Job } from "bullmq";

import type { AiJsonObject } from "../ai/ai-provider";
import { AiService } from "../ai/ai.service";
import type { ContractGenerationJobData } from "./contract-generation.types";
import { ContractGenerationsRepository } from "./contract-generations.repository";

const PROMPT_ID = "contract-draft";
const PROMPT_VERSION = "1.0.0";

@Injectable()
export class ContractGenerationProcessor {
  constructor(
    private readonly ai: AiService,
    private readonly generations: ContractGenerationsRepository,
  ) {}

  async process(job: Job<ContractGenerationJobData>): Promise<void> {
    const generation = await this.generations.findForProcessing(
      job.data.generationId,
    );
    if (!generation || generation.status === AiGenerationStatus.COMPLETED) {
      return;
    }

    await this.generations.markGenerating(
      generation.id,
      job.attemptsMade + 1,
    );

    try {
      const result = await this.ai.generateStructured({
        maxTokens: 4_000,
        output: {
          description: "Структурированный проект договора на русском языке",
          name: "contract_draft_v1",
          schema: contractDraftSchema,
        },
        prompt: {
          id: PROMPT_ID,
          trustedInstruction: [
            "Подготовь структурированный проект договора на русском языке.",
            "Используй только переданные условия сделки и ответы пользователя.",
            "Не придумывай реквизиты сторон, даты, суммы, адреса или иные факты.",
            "Сформулируй конкретные взаимные обязательства, порядок оплаты, исполнения, приёмки, ответственности и расторжения, когда они применимы к выбранному типу сделки.",
            "Не добавляй комментарии о работе модели и не включай персональные данные, которых нет во входных данных.",
            "В warnings перечисли только юридически значимые сведения, которые сторонам нужно проверить перед подписанием; если таких сведений нет, верни пустой массив.",
          ].join(" "),
          version: PROMPT_VERSION,
        },
        safetyIdentifier: generation.userId,
        userData: toAiObject({
          clarificationAnswers: generation.clarificationAnswers ?? {},
          documentRequirements:
            generation.templateVersion.documentRequirements.map(
              ({ description, key, required, title }) => ({
                description,
                key,
                required,
                title,
              }),
            ),
          inputAnswers: generation.inputAnswers,
          templateTitle: generation.templateVersion.template.title,
          templateVersion: generation.templateVersion.versionNumber,
        }),
      });
      const draft = parseContractDraft(result.data);
      await this.generations.markCompleted({
        draft: toPrismaObject(draft),
        id: generation.id,
        metadata: toPrismaObject({
          clarification: generation.providerMetadata,
          generation: result.metadata,
        }),
      });
    } catch (error) {
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= attempts) {
        await this.generations.markFailed(
          generation.id,
          "AI_GENERATION_FAILED",
        );
      }
      throw error;
    }
  }
}

const contractDraftSchema: AiJsonObject = {
  additionalProperties: false,
  properties: {
    preamble: { maxLength: 2_000, minLength: 1, type: "string" },
    sections: {
      items: {
        additionalProperties: false,
        properties: {
          clauses: {
            items: { maxLength: 2_000, minLength: 1, type: "string" },
            maxItems: 20,
            minItems: 1,
            type: "array",
          },
          heading: { maxLength: 200, minLength: 1, type: "string" },
        },
        required: ["clauses", "heading"],
        type: "object",
      },
      maxItems: 20,
      minItems: 3,
      type: "array",
    },
    title: { maxLength: 240, minLength: 1, type: "string" },
    warnings: {
      items: { maxLength: 500, minLength: 1, type: "string" },
      maxItems: 10,
      type: "array",
    },
  },
  required: ["preamble", "sections", "title", "warnings"],
  type: "object",
};

function parseContractDraft(value: AiJsonObject): ContractStructuredDraft {
  return value as unknown as ContractStructuredDraft;
}

function toAiObject(value: unknown): AiJsonObject {
  return JSON.parse(JSON.stringify(value)) as AiJsonObject;
}

function toPrismaObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
