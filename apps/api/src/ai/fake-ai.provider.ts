import { Injectable } from "@nestjs/common";

import type {
  AiJsonObject,
  AiJsonValue,
  AiProvider,
  AiStructuredRequest,
  AiStructuredResult,
} from "./ai-provider";
import { AiOutputValidator } from "./ai-output.validator";
import { assertAiRequest } from "./ai-request.builder";
import { PiiRedactor } from "./pii-redactor";

@Injectable()
export class FakeAiProvider implements AiProvider {
  constructor(
    private readonly outputValidator: AiOutputValidator,
    private readonly piiRedactor: PiiRedactor,
  ) {}

  generateStructured<T extends AiJsonObject = AiJsonObject>(
    request: AiStructuredRequest,
  ): Promise<AiStructuredResult<T>> {
    assertAiRequest(request);
    this.outputValidator.assertSchema(request.output.name, request.output.schema);
    const redacted = this.piiRedactor.redact(request.userData, request.piiPaths);
    const generated =
      request.prompt.id === "deal-intake"
        ? generateIntake(redacted.data)
        : request.prompt.id === "contract-clarification"
        ? generateClarification(redacted.data)
        : generateFromSchema(request.output.schema);

    return Promise.resolve({
      data: this.outputValidator.validateObject<T>(
        generated as AiJsonObject,
        request.output.schema,
      ),
      metadata: {
        model: "fake-yandexgpt",
        modelVersion: "fake-v1",
        promptId: request.prompt.id,
        promptVersion: request.prompt.version,
        provider: "fake",
        providerRequestId: null,
        redactedPiiCount: redacted.redactedCount,
        usage: {
          completionTokens: 0,
          promptTokens: 0,
          totalTokens: 0,
        },
      },
    });
  }
}

// Deterministic development fixture; production uses YandexAiProvider.
function generateIntake(data: AiJsonObject): AiJsonObject {
  const description = typeof data.description === "string" ? data.description : "";
  const slug = /презентац|консультац|услуг/i.test(description) ? "paid-services"
    : /ремонт|работ/i.test(description) ? "work-contract"
      : /аренд/i.test(description) ? "property-rental"
        : /за[её]м|одолж/i.test(description) ? "personal-loan"
          : /прода|купить/i.test(description) ? "movable-property-sale" : "individual-agreement";
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const candidate = candidates.find(item => isJsonObject(item) && item.slug === slug);
  const actualSlug = isJsonObject(candidate) ? slug : "individual-agreement";
  const fields: AiJsonValue[] = [];
  const key = ({ "paid-services": "serviceDescription", "work-contract": "workDescription", "property-rental": "propertyDescription", "individual-agreement": "subject" } as Record<string, string>)[actualSlug];
  if (key) {
    const subject = description.split(/\s+(?:за\s+\d|стоимость\s+\d|до\s+\d{4}-)/i)[0] ?? description;
    fields.push({ key, value: subject, evidence: subject });
  }
  if (actualSlug === "paid-services") {
    const amount = description.match(/(\d[\d ]*)\s*(руб|₽)/i);
    if (amount) fields.push({ key: "paymentAmount", value: (amount[1] ?? "").replaceAll(" ", ""), evidence: amount[0] });
    const date = description.match(/\d{4}-\d{2}-\d{2}/);
    if (date) fields.push({ key: "completionDate", value: date[0], evidence: date[0] });
  }
  return { templateSlug: actualSlug, title: "Проект по описанию", reason: "Предложение тестового провайдера. Проверьте условия перед продолжением.", warnings: [], fields };
}

function generateClarification(userData: AiJsonObject): AiJsonObject {
  if (typeof userData.templateSlug === "string" && userData.templateSlug !== "property-rental") {
    return { questions: [], status: "READY_TO_GENERATE" };
  }
  const clarificationAnswers = isJsonObject(userData.clarificationAnswers)
    ? userData.clarificationAnswers
    : {};
  if (Object.keys(clarificationAnswers).length > 0) {
    return { questions: [], status: "READY_TO_GENERATE" };
  }
  return {
    questions: [
      {
        description: "Уточнение влияет на распределение расходов по договору.",
        id: "utilitiesPayer",
        label: "Кто оплачивает коммунальные услуги?",
        options: [
          { label: "Арендатор", value: "tenant" },
          { label: "Арендодатель", value: "landlord" },
          { label: "Поровну", value: "equally" },
        ],
        required: true,
        type: "single_choice",
      },
    ],
    status: "NEED_MORE_INFO",
  };
}

function generateFromSchema(schema: AiJsonObject): AiJsonValue {
  if ("const" in schema) return schema.const;
  const values = schema.enum;
  if (Array.isArray(values) && values.length > 0) return values[0] ?? null;
  if ("default" in schema) return schema.default;

  switch (schema.type) {
    case "object":
      return generateObject(schema);
    case "array": {
      const items = isJsonObject(schema.items) ? schema.items : {};
      const minimum = numberValue(schema.minItems, 0);
      return Array.from({ length: minimum }, () => generateFromSchema(items));
    }
    case "boolean":
      return false;
    case "integer":
      return Math.ceil(numberValue(schema.minimum, 0));
    case "number":
      return numberValue(schema.minimum, 0);
    case "null":
      return null;
    case "string":
      return generateString(schema);
    default:
      return null;
  }
}

function generateObject(schema: AiJsonObject): AiJsonObject {
  const properties = isJsonObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? new Set(schema.required.filter((value): value is string => typeof value === "string"))
    : new Set(Object.keys(properties));

  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => required.has(key))
      .map(([key, propertySchema]) => [
        key,
        generateFromSchema(isJsonObject(propertySchema) ? propertySchema : {}),
      ]),
  );
}

function generateString(schema: AiJsonObject): string {
  if (schema.format === "date") return "2026-01-01";
  if (schema.format === "date-time") return "2026-01-01T00:00:00.000Z";
  if (schema.format === "email") return "example@example.com";
  const minimum = numberValue(schema.minLength, 0);
  return "Демонстрационное значение".padEnd(minimum, ".");
}

function numberValue(value: AiJsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isJsonObject(value: AiJsonValue | undefined): value is AiJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
