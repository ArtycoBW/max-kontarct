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

const PROMPT_ID = "contract-clarification";
const PROMPT_VERSION = "1.0.0";
const MAX_QUESTIONS = 5;

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
    const validated = await this.templates.validateAnswers(templateSlug, request);
    const output = await this.generate({
      clarificationAnswers: {},
      inputAnswers: validated.answers,
      previousQuestions: [],
      templateTitle: validated.snapshot.templateTitle,
    }, userId);

    const record = await this.clarifications.create({
      inputAnswers: toPrismaObject(validated.answers),
      metadata: toPrismaObject(output.metadata),
      promptId: PROMPT_ID,
      promptVersion: PROMPT_VERSION,
      questions: toPrismaArray(output.data.questions),
      status: toDatabaseStatus(output.data.status),
      templateVersionId: validated.snapshot.templateVersionId,
      userId,
    });
    return toResponse(record);
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
    const output = await this.generate({
      clarificationAnswers: cumulativeAnswers,
      inputAnswers: toJsonObject(session.inputAnswers),
      previousQuestions: questions,
      templateTitle: session.templateVersion.template.title,
    }, userId);
    const record = await this.clarifications.update({
      answers: toPrismaObject(cumulativeAnswers),
      id: session.id,
      metadata: toPrismaObject(output.metadata),
      questions: toPrismaArray(output.data.questions),
      status: toDatabaseStatus(output.data.status),
    });
    return toResponse(record);
  }

  private async generate(
    data: {
      clarificationAnswers: Record<string, unknown>;
      inputAnswers: Record<string, unknown>;
      previousQuestions: AiClarificationQuestion[];
      templateTitle: string;
    },
    userId: string,
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
            `Если данных недостаточно, верни NEED_MORE_INFO и не более ${MAX_QUESTIONS} конкретных вопросов.`,
            "Используй только типы single_choice, boolean, short_text, number или date.",
            "Для single_choice верни минимум два варианта, для остальных типов options должен быть пустым.",
            "Не спрашивай ФИО, телефон, email, паспортные данные и другие лишние персональные данные.",
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
          message: "Не удалось подготовить уточняющие вопросы. Повторите попытку",
        });
      }
      throw error;
    }
  }
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
      maxItems: MAX_QUESTIONS,
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
      throw answersInvalid(question.id, "Введите ответ длиной до 1000 символов");
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

function toResponse(record: AiClarificationRecord): AiClarificationSessionResponse {
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
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
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
