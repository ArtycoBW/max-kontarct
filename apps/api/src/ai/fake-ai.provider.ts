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
      request.prompt.id === "contract-clarification"
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
