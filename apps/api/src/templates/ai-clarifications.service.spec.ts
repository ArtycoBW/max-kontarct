import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AiGenerationStatus } from "@prisma/client";

import type {
  AiJsonObject,
  AiStructuredRequest,
  AiStructuredResult,
} from "../ai/ai-provider";
import { AiProviderError } from "../ai/ai-provider.error";
import { AiService } from "../ai/ai.service";
import type { AiClarificationRecord } from "./ai-clarifications.repository";
import { AiClarificationsRepository } from "./ai-clarifications.repository";
import { AiClarificationsService } from "./ai-clarifications.service";
import { TemplatesService } from "./templates.service";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "10000000-0000-4000-8000-000000000001";
const versionId = "20000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-08-29T18:00:00.000Z");

describe("AiClarificationsService", () => {
  const generateStructured = jest.fn<
    Promise<AiStructuredResult>,
    [AiStructuredRequest]
  >();
  const create = jest.fn<Promise<AiClarificationRecord>, [unknown]>();
  const findOwned = jest.fn<Promise<AiClarificationRecord | null>, [string, string, string]>();
  const update = jest.fn<Promise<AiClarificationRecord>, [unknown]>();
  const validateAnswers = jest.fn();
  const service = new AiClarificationsService(
    { generateStructured } as unknown as AiService,
    { create, findOwned, update } as unknown as AiClarificationsRepository,
    { validateAnswers } as unknown as TemplatesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    validateAnswers.mockResolvedValue({
      answers: { paymentAmount: 120_000 },
      snapshot: {
        templateTitle: "Аренда имущества",
        templateVersionId: versionId,
      },
      valid: true,
    });
  });

  it("creates a persisted session when more information is required", async () => {
    generateStructured.mockResolvedValue(aiResult(needMoreInfo()));
    create.mockResolvedValue(record());

    await expect(
      service.start("property-rental", userId, {
        answers: { paymentAmount: 120_000 },
        templateVersionId: versionId,
      }),
    ).resolves.toMatchObject({
      id: sessionId,
      questions: [expect.objectContaining({ id: "utilitiesPayer" })],
      status: "NEED_MORE_INFO",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: "contract-clarification",
        promptVersion: "1.1.0",
        status: AiGenerationStatus.NEED_MORE_INFO,
        templateVersionId: versionId,
        userId,
      }),
    );
  });

  it("keeps answers from earlier rounds and marks the session ready", async () => {
    findOwned.mockResolvedValue(
      record({
        clarificationAnswers: { depositRequired: true },
      }),
    );
    generateStructured.mockResolvedValue(
      aiResult({ questions: [], status: "READY_TO_GENERATE" }),
    );
    update.mockResolvedValue(
      record({
        clarificationAnswers: {
          depositRequired: true,
          utilitiesPayer: "tenant",
        },
        questions: [],
        status: AiGenerationStatus.READY_TO_GENERATE,
      }),
    );

    await expect(
      service.answer("property-rental", sessionId, userId, {
        answers: { utilitiesPayer: "tenant" },
      }),
    ).resolves.toMatchObject({
      answers: { depositRequired: true, utilitiesPayer: "tenant" },
      questions: [],
      status: "READY_TO_GENERATE",
    });

    expect(generateStructured.mock.calls[0]?.[0].userData).toMatchObject({
      clarificationAnswers: {
        depositRequired: true,
        utilitiesPayer: "tenant",
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: { depositRequired: true, utilitiesPayer: "tenant" },
        status: AiGenerationStatus.READY_TO_GENERATE,
      }),
    );
  });

  it("rejects an answer that does not match the generated question", async () => {
    findOwned.mockResolvedValue(record());

    await expect(
      service.answer("property-rental", sessionId, userId, {
        answers: { utilitiesPayer: "unknown" },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(generateStructured).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("validates and normalizes every supported question type", async () => {
    const questions = [
      ...needMoreInfo().questions,
      {
        description: "",
        id: "depositRequired",
        label: "Нужен обеспечительный платёж?",
        options: [],
        required: true,
        type: "boolean" as const,
      },
      {
        description: "",
        id: "specialTerms",
        label: "Особые условия",
        options: [],
        required: true,
        type: "short_text" as const,
      },
      {
        description: "",
        id: "paymentDay",
        label: "День оплаты",
        options: [],
        required: true,
        type: "number" as const,
      },
      {
        description: "",
        id: "handoverDate",
        label: "Дата передачи",
        options: [],
        required: true,
        type: "date" as const,
      },
    ];
    findOwned.mockResolvedValue(record({ questions }));
    generateStructured.mockResolvedValue(
      aiResult({ questions: [], status: "READY_TO_GENERATE" }),
    );
    update.mockResolvedValue(
      record({
        clarificationAnswers: {
          depositRequired: false,
          handoverDate: "2026-09-01",
          paymentDay: 15,
          specialTerms: "Без животных",
          utilitiesPayer: "tenant",
        },
        questions: [],
        status: AiGenerationStatus.READY_TO_GENERATE,
      }),
    );

    await service.answer("property-rental", sessionId, userId, {
      answers: {
        depositRequired: false,
        handoverDate: "2026-09-01",
        paymentDay: 15,
        specialTerms: "  Без животных  ",
        utilitiesPayer: "tenant",
      },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: {
          depositRequired: false,
          handoverDate: "2026-09-01",
          paymentDay: 15,
          specialTerms: "Без животных",
          utilitiesPayer: "tenant",
        },
      }),
    );
  });

  it("returns a stable service error when the AI provider fails", async () => {
    generateStructured.mockRejectedValue(
      new AiProviderError("AI_PROVIDER_TIMEOUT", "timeout", true),
    );

    await expect(
      service.start("property-rental", userId, {
        answers: { paymentAmount: 120_000 },
        templateVersionId: versionId,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(create).not.toHaveBeenCalled();
  });

  it("filters questions already answered by the questionnaire and personal questions", async () => {
    validateAnswers.mockResolvedValue({
      answers: { paymentFrequency: "Ежемесячно" },
      snapshot: {
        templateTitle: "Аренда имущества",
        templateVersionId: versionId,
      },
      valid: true,
    });
    generateStructured.mockResolvedValue(aiResult({
      questions: [
        shortTextQuestion("payment_periodicity", "Какова периодичность оплаты?"),
        shortTextQuestion("property_address", "Укажите полный адрес имущества"),
        shortTextQuestion("landlord_contact", "Укажите телефон арендодателя"),
      ],
      status: "NEED_MORE_INFO",
    }));
    create.mockResolvedValue(record());

    await service.start("property-rental", userId, {
      answers: { paymentFrequency: "Ежемесячно" },
      templateVersionId: versionId,
    });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      metadata: {
        questionHistory: [{ id: "property_address" }],
      },
      questions: [{ id: "property_address" }],
    });
  });

  it("stops after five questions across the whole session", async () => {
    const questionHistory = [
      ...needMoreInfo().questions,
      shortTextQuestion("address", "Адрес имущества"),
      shortTextQuestion("area", "Площадь имущества"),
      shortTextQuestion("restrictions", "Ограничения использования"),
      shortTextQuestion("contents", "Что находится в помещении"),
    ];
    findOwned.mockResolvedValue(record({
      providerMetadata: { questionHistory },
    }));
    update.mockResolvedValue(record({
      clarificationAnswers: { utilitiesPayer: "tenant" },
      providerMetadata: { questionHistory },
      questions: [],
      status: AiGenerationStatus.READY_TO_GENERATE,
    }));

    await expect(service.answer("property-rental", sessionId, userId, {
      answers: { utilitiesPayer: "tenant" },
    })).resolves.toMatchObject({
      questions: [],
      status: "READY_TO_GENERATE",
    });

    expect(generateStructured).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: AiGenerationStatus.READY_TO_GENERATE,
    }));
  });
});

function needMoreInfo() {
  return {
    questions: [
      {
        description: "Уточнение влияет на распределение расходов.",
        id: "utilitiesPayer",
        label: "Кто оплачивает коммунальные услуги?",
        options: [
          { label: "Арендатор", value: "tenant" },
          { label: "Арендодатель", value: "landlord" },
        ],
        required: true,
        type: "single_choice" as const,
      },
    ],
    status: "NEED_MORE_INFO" as const,
  };
}

function aiResult(data: AiJsonObject): AiStructuredResult {
  return {
    data,
    metadata: {
      model: "fake-yandexgpt",
      modelVersion: "fake-v1",
      promptId: "contract-clarification",
      promptVersion: "1.1.0",
      provider: "fake",
      providerRequestId: null,
      redactedPiiCount: 0,
      usage: {
        completionTokens: 0,
        promptTokens: 0,
        totalTokens: 0,
      },
    },
  };
}

function record(
  overrides: Partial<AiClarificationRecord> = {},
): AiClarificationRecord {
  return {
    clarificationAnswers: null,
    createdAt,
    id: sessionId,
    inputAnswers: { paymentAmount: 120_000 },
    providerMetadata: {},
    questions: needMoreInfo().questions,
    status: AiGenerationStatus.NEED_MORE_INFO,
    templateVersion: {
      template: { slug: "property-rental", title: "Аренда имущества" },
      versionNumber: 1,
    },
    templateVersionId: versionId,
    updatedAt: createdAt,
    userId,
    ...overrides,
  };
}

function shortTextQuestion(id: string, label: string) {
  return {
    description: "",
    id,
    label,
    options: [],
    required: true,
    type: "short_text" as const,
  };
}
