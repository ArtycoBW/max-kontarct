import { AiGenerationStatus } from "@prisma/client";
import type { Job } from "bullmq";

import type {
  AiJsonObject,
  AiStructuredRequest,
  AiStructuredResult,
} from "../ai/ai-provider";
import { AiService } from "../ai/ai.service";
import { ContractGenerationProcessor } from "./contract-generation.processor";
import type { ContractGenerationJobData } from "./contract-generation.types";
import type { ContractGenerationRecord } from "./contract-generations.repository";
import { ContractGenerationsRepository } from "./contract-generations.repository";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { missingContractTerms } from "./contract-completeness";

const cases = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../../tests/fixtures/contract-cases.json"),
    "utf8",
  ),
) as Array<{
  slug: string;
  title: string;
  input: Record<string, string | boolean | number>;
  answers: Record<string, string>;
}>;

type MarkCompletedInput = Parameters<
  ContractGenerationsRepository["markCompleted"]
>[0];

const generationId = "10000000-0000-4000-8000-000000000001";

describe("ContractGenerationProcessor", () => {
  const generateStructured = jest.fn<
    Promise<AiStructuredResult>,
    [AiStructuredRequest]
  >();
  const findForProcessing = jest.fn<
    Promise<ContractGenerationRecord | null>,
    [string]
  >();
  const markCompleted = jest.fn<
    Promise<ContractGenerationRecord>,
    [MarkCompletedInput]
  >();
  const markFailed = jest.fn<
    Promise<ContractGenerationRecord>,
    [string, string]
  >();
  const markGenerating = jest.fn<
    Promise<ContractGenerationRecord>,
    [string, number]
  >();
  const processor = new ContractGenerationProcessor(
    { generateStructured } as unknown as AiService,
    {
      findForProcessing,
      markCompleted,
      markFailed,
      markGenerating,
    } as unknown as ContractGenerationsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findForProcessing.mockResolvedValue(record());
    markGenerating.mockResolvedValue(record(AiGenerationStatus.GENERATING));
    markCompleted.mockResolvedValue(record(AiGenerationStatus.COMPLETED));
    markFailed.mockResolvedValue(record(AiGenerationStatus.FAILED));
  });

  it("persists a structured draft and provider metadata", async () => {
    generateStructured.mockResolvedValue({
      data: draft(),
      metadata: metadata(),
    });

    await processor.process(job());

    expect(markGenerating).toHaveBeenCalledWith(generationId, 1);
    const request = generateStructured.mock.calls[0]?.[0];
    expect(request?.prompt.id).toBe("contract-draft");
    expect(request?.userData).toMatchObject({
      inputAnswers: { price: 1000 },
      templateTitle: "Оказание услуг",
    });
    const completed = markCompleted.mock.calls[0]?.[0];
    expect(completed?.draft).toMatchObject({ title: "Договор оказания услуг" });
    expect(completed?.id).toBe(generationId);
    expect(completed?.metadata).toMatchObject({
      generation: { provider: "fake" },
    });
  });

  it("marks only the final failed attempt as terminal", async () => {
    generateStructured.mockRejectedValue(new Error("provider timeout"));

    await expect(processor.process(job(2, 3))).rejects.toThrow(
      "provider timeout",
    );
    expect(markFailed).toHaveBeenCalledWith(
      generationId,
      "AI_GENERATION_FAILED",
    );
  });

  it.each(cases)(
    "forwards every confirmed condition and its question for $slug",
    async (item) => {
      const generation = record();
      generation.inputAnswers = item.input;
      generation.clarificationAnswers = item.answers;
      generation.templateVersion.template = {
        slug: item.slug,
        title: item.title,
      };
      generation.templateVersion.questionnaireSchema = {
        properties: Object.fromEntries(
          Object.keys(item.input).map((key) => [key, { title: key }]),
        ),
      };
      const history = missingContractTerms(item.slug, item.input).map(
        (question) => ({ ...question, options: [] }),
      );
      generation.providerMetadata = {
        completenessVersion: "1.0.0",
        questionHistory: history,
      };
      findForProcessing.mockResolvedValue(generation);
      generateStructured.mockResolvedValue({
        data: draft(),
        metadata: metadata(),
      });
      await processor.process(job());
      expect(generateStructured.mock.calls[0]?.[0].userData).toMatchObject({
        inputAnswers: item.input,
        clarificationAnswers: item.answers,
        clarificationQuestions: history,
        templateTitle: item.title,
      });
      expect(markCompleted).toHaveBeenCalledTimes(1);
      expect(markCompleted.mock.calls[0]?.[0].draft.sections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ heading: "Условия сделки" }),
        ]),
      );
    },
  );

  it("the worker independently refuses incomplete conditions", async () => {
    const generation = record();
    generation.providerMetadata = { completenessVersion: "1.0.0" };
    findForProcessing.mockResolvedValue(generation);
    await expect(processor.process(job(0, 1))).rejects.toThrow(
      "CONTRACT_TERMS_INCOMPLETE",
    );
    expect(generateStructured).not.toHaveBeenCalled();
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it("keeps a transient provider error retryable before the final attempt", async () => {
    generateStructured.mockRejectedValue(new Error("provider timeout"));
    await expect(processor.process(job(0, 3))).rejects.toThrow(
      "provider timeout",
    );
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("does not regenerate a completed draft when the queue redelivers its job", async () => {
    findForProcessing.mockResolvedValue(record(AiGenerationStatus.COMPLETED));
    await processor.process(job());
    expect(generateStructured).not.toHaveBeenCalled();
    expect(markGenerating).not.toHaveBeenCalled();
    expect(markCompleted).not.toHaveBeenCalled();
  });
});

function job(attemptsMade = 0, attempts = 3): Job<ContractGenerationJobData> {
  return {
    attemptsMade,
    data: { generationId },
    opts: { attempts },
  } as Job<ContractGenerationJobData>;
}

function draft(): AiJsonObject {
  return {
    preamble: "Стороны заключили настоящий договор.",
    sections: [
      { clauses: ["Исполнитель оказывает услуги."], heading: "Предмет" },
      { clauses: ["Стоимость услуг — 1000 рублей."], heading: "Стоимость" },
      { clauses: ["Стороны отвечают по закону."], heading: "Ответственность" },
    ],
    title: "Договор оказания услуг",
    warnings: [],
  };
}

function metadata() {
  return {
    model: "fake-structured-v1",
    modelVersion: "1",
    promptId: "contract-draft",
    promptVersion: "1.0.0",
    provider: "fake" as const,
    providerRequestId: null,
    redactedPiiCount: 0,
    usage: { completionTokens: null, promptTokens: null, totalTokens: null },
  };
}

function record(
  status: AiGenerationStatus = AiGenerationStatus.QUEUED,
): ContractGenerationRecord {
  return {
    attemptCount: 0,
    clarificationAnswers: { schedule: "daily" },
    completedAt: null,
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    failedAt: null,
    failureCode: null,
    id: generationId,
    inputAnswers: { price: 1000 },
    providerMetadata: { clarification: true },
    queuedAt: new Date("2026-08-30T00:00:00.000Z"),
    startedAt: null,
    status,
    structuredDraft: null,
    templateVersion: {
      documentRequirements: [],
      questionnaireSchema: {},
      template: { slug: "paid-services", title: "Оказание услуг" },
      versionNumber: 1,
    },
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
    userId: "20000000-0000-4000-8000-000000000001",
  };
}
