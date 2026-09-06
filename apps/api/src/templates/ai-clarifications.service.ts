import type {
  AiClarificationQuestion,
  AiClarificationSessionResponse,
  AiClarificationStatus,
  AnswerAiClarificationRequest,
  StartAiClarificationRequest,
} from "@max-contract/contracts";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AiGenerationStatus, type Prisma } from "@prisma/client";

import type { AiJsonObject } from "../ai/ai-provider";
import { AiProviderError } from "../ai/ai-provider.error";
import { AiService } from "../ai/ai.service";
import type { AiClarificationRecord } from "./ai-clarifications.repository";
import { AiClarificationsRepository } from "./ai-clarifications.repository";
import { TemplatesService } from "./templates.service";
import {
  COMPLETENESS_VERSION,
  invalidRequiredTermAnswers,
  isCompletenessSession,
  knownContractTerms,
  missingContractTerms,
} from "./contract-completeness";

const PROMPT_ID = "contract-clarification";
const PROMPT_VERSION = "1.2.0";
const MAX_TOTAL_QUESTIONS = 5;

type ClarificationAiOutput = {
  questions: AiClarificationQuestion[];
  status: AiClarificationStatus;
};

@Injectable()
export class AiClarificationsService {
  constructor(
    private readonly ai: AiService,
    private readonly clarifications: AiClarificationsRepository,
    private readonly templates: TemplatesService,
  ) {}

  async start(
    templateSlug: string,
    userId: string,
    request: StartAiClarificationRequest,
  ): Promise<AiClarificationSessionResponse> {
    const validated = await this.templates.validateAnswers(
      templateSlug,
      request,
    );
    const output = await this.generate(
      {
        clarificationAnswers: {},
        inputAnswers: validated.answers,
        previousQuestions: [],
        templateTitle: validated.snapshot.templateTitle,
        templateSlug,
        requiredQuestions: missingContractTerms(
          templateSlug,
          validated.answers,
        ),
      },
      userId,
      MAX_TOTAL_QUESTIONS,
    );
    const data = prioritizeRequiredQuestions(
      sanitizeClarificationOutput(output.data, {
        clarificationAnswers: {},
        inputAnswers: validated.answers,
        previousQuestions: knownContractTerms(templateSlug, validated.answers),
        remainingQuestions: MAX_TOTAL_QUESTIONS,
      }),
      missingContractTerms(templateSlug, validated.answers),
      MAX_TOTAL_QUESTIONS,
    );

    const record = await this.clarifications.create({
      inputAnswers: toPrismaObject(validated.answers),
      metadata: withQuestionHistory(
        { ...output.metadata, completenessVersion: COMPLETENESS_VERSION },
        data.questions,
      ),
      promptId: PROMPT_ID,
      promptVersion: PROMPT_VERSION,
      questions: toPrismaArray(data.questions),
      status: toDatabaseStatus(data.status),
      templateVersionId: validated.snapshot.templateVersionId,
      userId,
    });
    return toResponse(record);
  }

  async get(
    templateSlug: string,
    sessionId: string,
    userId: string,
  ): Promise<AiClarificationSessionResponse> {
    const session = await this.clarifications.findOwned(
      sessionId,
      templateSlug,
      userId,
    );
    if (!session) {
      throw new NotFoundException({
        code: "AI_CLARIFICATION_NOT_FOUND",
        message: "Сессия уточняющих вопросов не найдена",
      });
    }
    return toResponse(session);
  }

  async answer(
    templateSlug: string,
    sessionId: string,
    userId: string,
    request: AnswerAiClarificationRequest,
  ): Promise<AiClarificationSessionResponse> {
    const session = await this.clarifications.findOwned(
      sessionId,
      templateSlug,
      userId,
    );
    if (!session) {
      throw new NotFoundException({
        code: "AI_CLARIFICATION_NOT_FOUND",
        message: "Сессия уточняющих вопросов не найдена",
      });
    }
    if (session.status !== AiGenerationStatus.NEED_MORE_INFO) {
      throw new ConflictException({
        code: "AI_CLARIFICATION_ALREADY_READY",
        message: "Уточняющие вопросы уже завершены",
      });
    }

    const questions = parseQuestions(session.questions);
    const answers = validateClarificationAnswers(questions, request.answers);
    const previousAnswers = session.clarificationAnswers
      ? toJsonObject(session.clarificationAnswers)
      : {};
    const cumulativeAnswers = { ...previousAnswers, ...answers };
    const inputAnswers = toJsonObject(session.inputAnswers);
    const completenessEnabled = isCompletenessSession(session.providerMetadata);
    if (completenessEnabled) {
      const invalid = invalidRequiredTermAnswers(
        templateSlug,
        inputAnswers,
        answers,
      );
      if (invalid.length)
        throw new BadRequestException({
          code: "AI_CLARIFICATION_ANSWERS_INVALID",
          details: { errors: invalid },
          message: "Уточните условия, отмеченные в вопросах",
        });
    }
    const questionHistory = readQuestionHistory(
      session.providerMetadata,
      questions,
    );
    const remainingQuestions = Math.max(
      0,
      MAX_TOTAL_QUESTIONS - questionHistory.length,
    );
    const missing = completenessEnabled
      ? missingContractTerms(
          templateSlug,
          inputAnswers,
          cumulativeAnswers,
          questionHistory,
        )
      : [];
    if (missing.length > remainingQuestions) {
      throw new BadRequestException({
        code: "AI_CLARIFICATION_ANSWERS_INVALID",
        details: {
          errors: missing.map((question) => ({
            path: question.id,
            message: question.description,
          })),
        },
        message:
          "Уточните обязательные условия; при необходимости вернитесь к параметрам сделки",
      });
    }
    let data: ClarificationAiOutput = {
      questions: [],
      status: "READY_TO_GENERATE",
    };
    let metadata = withQuestionHistory(
      session.providerMetadata,
      questionHistory,
    );

    if (remainingQuestions > 0) {
      const output = await this.generate(
        {
          clarificationAnswers: cumulativeAnswers,
          inputAnswers,
          previousQuestions: questionHistory,
          templateTitle: session.templateVersion.template.title,
          templateSlug,
          requiredQuestions: missing,
        },
        userId,
        remainingQuestions,
      );
      data = prioritizeRequiredQuestions(
        sanitizeClarificationOutput(output.data, {
          clarificationAnswers: cumulativeAnswers,
          inputAnswers,
          previousQuestions: [
            ...questionHistory,
            ...knownContractTerms(
              templateSlug,
              inputAnswers,
              cumulativeAnswers,
              questionHistory,
            ),
          ],
          remainingQuestions,
        }),
        missing,
        remainingQuestions,
      );
      metadata = withQuestionHistory(
        {
          ...output.metadata,
          ...(completenessEnabled
            ? { completenessVersion: COMPLETENESS_VERSION }
            : {}),
        },
        [...questionHistory, ...data.questions],
      );
    }
    const record = await this.clarifications.update({
      answers: toPrismaObject(cumulativeAnswers),
      id: session.id,
      expectedUpdatedAt: session.updatedAt,
      metadata,
      questions: toPrismaArray(data.questions),
      status: toDatabaseStatus(data.status),
    });
    return toResponse(record);
  }

  private async generate(
    data: {
      clarificationAnswers: Record<string, unknown>;
      inputAnswers: Record<string, unknown>;
      previousQuestions: AiClarificationQuestion[];
      templateTitle: string;
      templateSlug: string;
      requiredQuestions: AiClarificationQuestion[];
    },
    userId: string,
    maxQuestions: number,
  ) {
    try {
      const result = await this.ai.generateStructured({
        output: {
          description:
            "Решение о готовности данных и необходимые уточняющие вопросы",
          name: "contract_clarification_v1",
          schema: clarificationOutputSchema,
        },
        prompt: {
          id: PROMPT_ID,
          trustedInstruction: [
            "Оцени, достаточно ли данных для подготовки проекта договора.",
            `Если данных недостаточно, верни NEED_MORE_INFO и не более ${maxQuestions} конкретных вопросов.`,
            `За всю сессию можно задать не более ${MAX_TOTAL_QUESTIONS} вопросов.`,
            "Не повторяй вопросы из previousQuestions и не переспрашивай сведения, которые уже есть в inputAnswers или clarificationAnswers, даже если ключи или формулировки отличаются.",
            "Проверяй содержание значений, а не наличие ключа. Пустая строка, «потом», «по согласованию» и «квартира собственника» не задают конкретного условия.",
            "requiredQuestions уже проверены сервером: не создавай их дубликаты. Не задавай вопросы по другим типам сделок.",
            "Условия могут содержаться в свободном описании: используй их и не переспрашивай полный адрес, оплату или приёмку, если они конкретно описаны.",
            "Используй только типы single_choice, boolean, short_text, number или date.",
            "Для single_choice верни минимум два варианта, для остальных типов options должен быть пустым.",
            "Не спрашивай ФИО, телефон, email, контакты, паспортные данные инициатора или контрагента: они берутся только из подтверждённых профилей.",
            "Если сведений достаточно, верни READY_TO_GENERATE и пустой массив questions.",
          ].join(" "),
          version: PROMPT_VERSION,
        },
        safetyIdentifier: userId,
        userData: toAiObject(data),
      });
      const outputData = parseClarificationOutput(result.data);
      return { ...result, data: outputData };
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw new ServiceUnavailableException({
          code: "AI_CLARIFICATION_UNAVAILABLE",
          message:
            "Не удалось подготовить уточняющие вопросы. Повторите попытку",
        });
      }
      throw error;
    }
  }
}

function prioritizeRequiredQuestions(
  output: ClarificationAiOutput,
  required: AiClarificationQuestion[],
  maximum: number,
): ClarificationAiOutput {
  const questions = [...required];
  const topics = new Set(
    required
      .map((question) => questionTopic(`${question.id} ${question.label}`))
      .filter(Boolean),
  );
  for (const question of output.questions) {
    if (questions.length >= maximum) break;
    const topic = questionTopic(`${question.id} ${question.label}`);
    if (
      questions.some((item) => item.id === question.id) ||
      (topic && topics.has(topic))
    )
      continue;
    questions.push(question);
    if (topic) topics.add(topic);
  }
  return {
    questions,
    status: questions.length ? "NEED_MORE_INFO" : "READY_TO_GENERATE",
  };
}

const clarificationOutputSchema: AiJsonObject = {
  additionalProperties: false,
  properties: {
    questions: {
      items: {
        additionalProperties: false,
        properties: {
          description: { maxLength: 300, type: "string" },
          id: {
            maxLength: 64,
            minLength: 1,
            pattern: "^[a-z][a-zA-Z0-9_]*$",
            type: "string",
          },
          label: { maxLength: 240, minLength: 1, type: "string" },
          options: {
            items: {
              additionalProperties: false,
              properties: {
                label: { maxLength: 120, minLength: 1, type: "string" },
                value: { maxLength: 120, minLength: 1, type: "string" },
              },
              required: ["label", "value"],
              type: "object",
            },
            maxItems: 8,
            type: "array",
          },
          required: { type: "boolean" },
          type: {
            enum: ["single_choice", "boolean", "short_text", "number", "date"],
            type: "string",
          },
        },
        required: ["description", "id", "label", "options", "required", "type"],
        type: "object",
      },
      maxItems: MAX_TOTAL_QUESTIONS,
      type: "array",
    },
    status: {
      enum: ["NEED_MORE_INFO", "READY_TO_GENERATE"],
      type: "string",
    },
  },
  required: ["questions", "status"],
  type: "object",
};

function assertClarificationOutput(output: ClarificationAiOutput): void {
  const questions = output.questions;
  const ids = new Set<string>();
  const invalidQuestion = questions.some((question) => {
    if (ids.has(question.id)) return true;
    ids.add(question.id);
    return question.type === "single_choice"
      ? question.options.length < 2
      : question.options.length > 0;
  });
  if (
    invalidQuestion ||
    (output.status === "NEED_MORE_INFO" && questions.length === 0) ||
    (output.status === "READY_TO_GENERATE" && questions.length > 0)
  ) {
    throw new AiProviderError(
      "AI_OUTPUT_INVALID",
      "AI вернул несогласованный набор уточняющих вопросов",
    );
  }
}

function parseClarificationOutput(value: AiJsonObject): ClarificationAiOutput {
  const output = value as unknown as ClarificationAiOutput;
  assertClarificationOutput(output);
  return output;
}

function sanitizeClarificationOutput(
  output: ClarificationAiOutput,
  context: {
    clarificationAnswers: Record<string, unknown>;
    inputAnswers: Record<string, unknown>;
    previousQuestions: AiClarificationQuestion[];
    remainingQuestions: number;
  },
): ClarificationAiOutput {
  if (output.status === "READY_TO_GENERATE") return output;

  const knownIds = new Set(
    [
      ...Object.keys(context.clarificationAnswers),
      ...context.previousQuestions.map(({ id }) => id),
    ].map(normalizeText),
  );
  const knownLabels = new Set(
    context.previousQuestions.map(({ label }) => normalizeText(label)),
  );
  const knownTopics = new Set(
    [
      ...Object.entries(context.inputAnswers)
        .filter(
          ([, value]) => value !== null && value !== undefined && value !== "",
        )
        .map(([key]) => key),
      ...Object.entries(context.clarificationAnswers)
        .filter(
          ([, value]) => value !== null && value !== undefined && value !== "",
        )
        .map(([key]) => key),
      ...context.previousQuestions.flatMap(({ id, label }) => [id, label]),
    ]
      .map(questionTopic)
      .filter((topic): topic is string => Boolean(topic)),
  );
  const questions: AiClarificationQuestion[] = [];

  for (const question of output.questions) {
    const id = normalizeText(question.id);
    const label = normalizeText(question.label);
    const topic = questionTopic(`${question.id} ${question.label}`);
    if (
      isPersonalQuestion(question) ||
      knownIds.has(id) ||
      knownLabels.has(label) ||
      (topic !== null && knownTopics.has(topic))
    ) {
      continue;
    }

    questions.push(question);
    knownIds.add(id);
    knownLabels.add(label);
    if (topic) knownTopics.add(topic);
    if (questions.length >= context.remainingQuestions) break;
  }

  return questions.length > 0
    ? { questions, status: "NEED_MORE_INFO" }
    : { questions: [], status: "READY_TO_GENERATE" };
}

function readQuestionHistory(
  metadata: Prisma.JsonValue,
  fallback: AiClarificationQuestion[],
): AiClarificationQuestion[] {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return fallback;
  }
  const rawHistory = metadata.questionHistory;
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return fallback;
  try {
    const history = rawHistory as unknown as AiClarificationQuestion[];
    assertClarificationOutput({ questions: history, status: "NEED_MORE_INFO" });
    return history.slice(0, MAX_TOTAL_QUESTIONS);
  } catch {
    return fallback;
  }
}

function withQuestionHistory(
  metadata: unknown,
  questions: AiClarificationQuestion[],
): Prisma.InputJsonObject {
  const stored = JSON.parse(JSON.stringify(metadata)) as Record<
    string,
    unknown
  >;
  return toPrismaObject({
    ...stored,
    questionHistory: questions.slice(0, MAX_TOTAL_QUESTIONS),
  });
}

function isPersonalQuestion(question: AiClarificationQuestion): boolean {
  const text = normalizeText(`${question.id} ${question.label}`);
  return (
    /(passport|phone|email|e mail|contact|full name|personal data|fio)/.test(
      text,
    ) ||
    /(паспорт|телефон|электронн.*почт|контакт|персональн.*данн|фио|фамили)/.test(
      text,
    ) ||
    /\b(landlord|tenant) (info|contact|name)\b/.test(text)
  );
}

function questionTopic(value: string): string | null {
  const text = normalizeText(value);
  if (
    /(termsacceptance|acceptance|handover|прием|принима|переда.*возвращ)/.test(
      text,
    )
  )
    return "acceptance";
  if (/(termspaymentmethod|способ.*оплат)/.test(text)) return "payment_method";
  if (
    /(termspayment|payment.*(procedure|terms|schedule)|поряд.*оплат|когда.*оплат)/.test(
      text,
    )
  )
    return "payment_terms";
  if (/(termsproperty)/.test(text)) return "property_address";
  if (/(termsmaterials|материал)/.test(text)) return "materials";
  if (/(termsloantransfer)/.test(text)) return "loan_transfer";
  if (/(termsloanrepayment)/.test(text)) return "loan_repayment";
  if (/(termsinterest)/.test(text)) return "interest_payment";
  if (/(address|location|адрес|местонахожд)/.test(text))
    return "property_address";
  if (/(room.*area|area.*room|area.*sqm|площад)/.test(text))
    return "property_area";
  if (
    /(payment.*(frequency|periodicity)|frequ.*payment|периодич.*оплат|частот.*оплат)/.test(
      text,
    )
  ) {
    return "payment_frequency";
  }
  if (
    /(payment.*amount|amount.*payment|размер.*плат|арендн.*плат)/.test(text)
  ) {
    return "payment_amount";
  }
  if (
    /(property.*type|type.*property|тип.*имуществ|вид.*имуществ)/.test(text)
  ) {
    return "property_type";
  }
  if (
    /(property.*description|description.*property|предмет.*аренд)/.test(text)
  ) {
    return "property_description";
  }
  if (/(utilit|коммун)/.test(text)) return "utilities";
  if (/(deposit|обеспечительн.*плат|залог)/.test(text)) return "deposit";
  if (/(start.*date|date.*start|дата.*начал|начал.*дат)/.test(text))
    return "start_date";
  if (/(end.*date|date.*end|дата.*оконч|оконч.*дат)/.test(text))
    return "end_date";
  return null;
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

function validateClarificationAnswers(
  questions: AiClarificationQuestion[],
  input: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = new Set(questions.map(({ id }) => id));
  const unknownKey = Object.keys(input).find((key) => !allowed.has(key));
  if (unknownKey) throw answersInvalid(unknownKey, "Неизвестный вопрос");

  const normalized: Record<string, unknown> = {};
  for (const question of questions) {
    const value = input[question.id];
    if (value === undefined || value === null || value === "") {
      if (question.required) {
        throw answersInvalid(question.id, "Ответьте на обязательный вопрос");
      }
      continue;
    }

    if (question.type === "single_choice") {
      if (
        typeof value !== "string" ||
        !question.options.some((option) => option.value === value)
      ) {
        throw answersInvalid(question.id, "Выберите один из вариантов");
      }
      normalized[question.id] = value;
      continue;
    }
    if (question.type === "boolean") {
      if (typeof value !== "boolean") {
        throw answersInvalid(question.id, "Выберите да или нет");
      }
      normalized[question.id] = value;
      continue;
    }
    if (question.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw answersInvalid(question.id, "Укажите число");
      }
      normalized[question.id] = value;
      continue;
    }
    if (question.type === "date") {
      if (typeof value !== "string" || !isDateOnly(value)) {
        throw answersInvalid(question.id, "Укажите корректную дату");
      }
      normalized[question.id] = value;
      continue;
    }
    if (typeof value !== "string" || !value.trim() || value.length > 1_000) {
      throw answersInvalid(
        question.id,
        "Введите ответ длиной до 1000 символов",
      );
    }
    normalized[question.id] = value.trim();
  }
  return normalized;
}

function parseQuestions(value: Prisma.JsonValue): AiClarificationQuestion[] {
  if (!Array.isArray(value)) throw storedDataInvalid();
  const parsed = value as unknown as AiClarificationQuestion[];
  assertClarificationOutput({ questions: parsed, status: "NEED_MORE_INFO" });
  return parsed;
}

function toResponse(
  record: AiClarificationRecord,
): AiClarificationSessionResponse {
  const status = toClarificationStatus(record.status);
  return {
    answers: record.clarificationAnswers
      ? toJsonObject(record.clarificationAnswers)
      : {},
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    questions: parseQuestionsForStatus(record.questions, status),
    status,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function parseQuestionsForStatus(
  value: Prisma.JsonValue,
  status: AiClarificationStatus,
): AiClarificationQuestion[] {
  if (!Array.isArray(value)) throw storedDataInvalid();
  const questions = value as unknown as AiClarificationQuestion[];
  assertClarificationOutput({ questions, status });
  return questions;
}

function toClarificationStatus(
  status: AiGenerationStatus,
): AiClarificationStatus {
  if (
    status === AiGenerationStatus.NEED_MORE_INFO ||
    status === AiGenerationStatus.READY_TO_GENERATE
  ) {
    return status;
  }
  throw new ConflictException({
    code: "AI_CLARIFICATION_ALREADY_READY",
    message: "Уточняющие вопросы уже завершены",
  });
}

function toDatabaseStatus(status: AiClarificationStatus): AiGenerationStatus {
  return status === "READY_TO_GENERATE"
    ? AiGenerationStatus.READY_TO_GENERATE
    : AiGenerationStatus.NEED_MORE_INFO;
}

function toAiObject(value: unknown): AiJsonObject {
  return JSON.parse(JSON.stringify(value)) as AiJsonObject;
}

function toPrismaObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function toPrismaArray(value: unknown): Prisma.InputJsonArray {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonArray;
}

function toJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw storedDataInvalid();
  }
  return value;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

function answersInvalid(path: string, message: string): BadRequestException {
  return new BadRequestException({
    code: "AI_CLARIFICATION_ANSWERS_INVALID",
    details: { errors: [{ message, path }] },
    message: "Проверьте ответы на уточняющие вопросы",
  });
}

function storedDataInvalid(): ConflictException {
  return new ConflictException({
    code: "AI_CLARIFICATION_DATA_INVALID",
    message: "Данные уточняющих вопросов повреждены",
  });
}
