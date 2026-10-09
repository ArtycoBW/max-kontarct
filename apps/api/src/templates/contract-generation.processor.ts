import type { ContractStructuredDraft } from "@max-contract/contracts";
import { Injectable } from "@nestjs/common";
import { AiGenerationStatus, type Prisma } from "@prisma/client";
import type { Job } from "bullmq";

import type { AiJsonObject } from "../ai/ai-provider";
import { AiService } from "../ai/ai.service";
import type { ContractGenerationJobData } from "./contract-generation.types";
import { ContractGenerationsRepository } from "./contract-generations.repository";
import {
  isCompletenessSession,
  missingContractTerms,
  withCompletenessContext,
} from "./contract-completeness";
import type { AiClarificationQuestion } from "@max-contract/contracts";
import {
  confirmedContractTerms,
  withConfirmedContractTerms,
} from "./contract-confirmed-terms";
import { normalizeContractDraft } from "./contract-draft-presentation";
import { INDIVIDUAL_TEMPLATE_SLUG, INDIVIDUAL_WARNING } from "./deal-intake.service";
import { declaredRoleTerm, readSubjectDocumentsParty } from "../deals/declared-party-roles";
import { assertNoDraftBlanks, contractDraftingInstructions, CONTRACT_DRAFT_PROMPT_VERSION } from "./contract-drafting-instructions";

const PROMPT_ID = "contract-draft";

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

    await this.generations.markGenerating(generation.id, job.attemptsMade + 1);

    try {
      // Recheck after queueing. Only the server reads profiles; no identity data is sent to AI.
      const parties = await this.generations.requireReadyParties(generation);
      if (
        isCompletenessSession(generation.providerMetadata) &&
        missingContractTerms(
          generation.templateVersion.template.slug,
          withCompletenessContext(generation.inputAnswers as Record<string, unknown>, generation.providerMetadata),
          (generation.clarificationAnswers ?? {}) as Record<string, unknown>,
        ).length
      )
        throw new Error("CONTRACT_TERMS_INCOMPLETE");
      const confirmedTerms = isCompletenessSession(generation.providerMetadata)
        ? confirmedContractTerms(
            generation.templateVersion.questionnaireSchema,
            generation.inputAnswers as Record<string, unknown>,
            (generation.clarificationAnswers ?? {}) as Record<string, unknown>,
            clarificationQuestionHistory(generation.providerMetadata),
          )
        : [];
      const roleTerm = declaredRoleTerm(generation.templateVersion.template.slug, readSubjectDocumentsParty(generation.providerMetadata));
      if (roleTerm) confirmedTerms.unshift(roleTerm);
      const result = await this.ai.generateStructured({
        maxTokens: 6_000,
        output: {
          description: "Структурированный проект договора на русском языке",
          name: "contract_draft_v1",
          schema: contractDraftSchema,
        },
        prompt: {
          id: PROMPT_ID,
          trustedInstruction: contractDraftingInstructions(generation.templateVersion.template.slug),
          version: CONTRACT_DRAFT_PROMPT_VERSION,
        },
        safetyIdentifier: generation.userId,
        userData: toAiObject({
          clarificationAnswers: generation.clarificationAnswers ?? {},
          confirmedTerms,
          clarificationQuestions: clarificationQuestionHistory(
            generation.providerMetadata,
          ),
          documentRequirements:
            generation.templateVersion.documentRequirements.map(
              ({ description, key, title }) => ({
                description,
                key,
                required: false,
                title,
              }),
            ),
          inputAnswers: generation.inputAnswers,
          sourceDescription: sourceDescription(generation.providerMetadata),
          templateSlug: generation.templateVersion.template.slug,
          templateTitle: generation.templateVersion.template.title,
          templateVersion: generation.templateVersion.versionNumber,
        }),
      });
      const normalizedDraft = normalizeContractDraft(parseContractDraft(result.data));
      assertNoDraftBlanks(normalizedDraft);
      const draft = withConfirmedContractTerms(normalizedDraft, confirmedTerms);
      if (generation.templateVersion.template.slug === INDIVIDUAL_TEMPLATE_SLUG) {
        draft.warnings = [...new Set([INDIVIDUAL_WARNING, ...draft.warnings])];
      }
      draft.sections.unshift({ heading: "Стороны договора", clauses: [
        `${parties.names.INITIATOR} — инициатор сделки.`,
        `${parties.names.COUNTERPARTY} — контрагент.`,
      ] });
      // The role mapping is deterministic and keeps the full names in the actual signed text.
      if (roleTerm) {
        const namedRoleTerm = roleTerm.replace(/Инициатор/gu, parties.names.INITIATOR!)
          .replace(/контрагент/gu, parties.names.COUNTERPARTY!);
        for (const section of draft.sections) section.clauses = section.clauses.map(clause => clause === roleTerm ? namedRoleTerm : clause);
      }
      await this.generations.markCompleted({
        draft: toPrismaObject(draft),
        id: generation.id,
        metadata: toPrismaObject({
          dealId: parties.dealId,
          partyNames: parties.names,
          clarification: generation.providerMetadata,
          generation: result.metadata,
          ...(confirmedTerms.length ? { confirmedTermsVersion: "2.0.0" } : {}),
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

function sourceDescription(metadata: Prisma.JsonValue): string {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.sourceDescription === "string"
    ? metadata.sourceDescription : "";
}

function clarificationQuestionHistory(
  metadata: Prisma.JsonValue,
): AiClarificationQuestion[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return [];
  return Array.isArray(metadata.questionHistory)
    ? (metadata.questionHistory as unknown as AiClarificationQuestion[])
    : [];
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
            minItems: 2,
            type: "array",
          },
          heading: { maxLength: 200, minLength: 1, type: "string" },
        },
        required: ["clauses", "heading"],
        type: "object",
      },
      maxItems: 8,
      minItems: 8,
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
