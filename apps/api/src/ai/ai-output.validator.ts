import { Injectable } from "@nestjs/common";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import type { AiJsonObject } from "./ai-provider";
import { AiProviderError } from "./ai-provider.error";

const SCHEMA_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_SCHEMA_LENGTH = 50_000;
const MAX_RESPONSE_LENGTH = 1_000_000;
const UNSAFE_TEXT_PATTERN =
  /<\/?[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html|\bon(?:error|load|click)\s*=/i;

@Injectable()
export class AiOutputValidator {
  private readonly ajv: Ajv2020;
  private readonly validators = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new Ajv2020({
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: true,
    });
    addFormats(this.ajv);
  }

  assertSchema(name: string, schema: AiJsonObject): void {
    if (!SCHEMA_NAME_PATTERN.test(name)) {
      throw new AiProviderError(
        "AI_OUTPUT_SCHEMA_INVALID",
        "Некорректное имя схемы ответа AI",
      );
    }
    if (
      schema.type !== "object" ||
      schema.additionalProperties !== false ||
      JSON.stringify(schema).length > MAX_SCHEMA_LENGTH
    ) {
      throw schemaError();
    }
    this.getValidator(schema);
  }

  parseAndValidate<T extends AiJsonObject>(
    content: string,
    schema: AiJsonObject,
  ): T {
    if (!content || content.length > MAX_RESPONSE_LENGTH) {
      throw invalidOutput();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw invalidOutput();
    }

    const validate = this.getValidator(schema);
    if (!validate(parsed)) {
      throw new AiProviderError(
        "AI_OUTPUT_INVALID",
        formatValidationMessage(validate.errors ?? []),
      );
    }
    if (containsUnsafeText(parsed)) {
      throw new AiProviderError(
        "AI_OUTPUT_UNSAFE",
        "Ответ AI содержит запрещённую разметку или исполняемый код",
      );
    }
    return parsed as T;
  }

  validateObject<T extends AiJsonObject>(
    value: AiJsonObject,
    schema: AiJsonObject,
  ): T {
    return this.parseAndValidate<T>(JSON.stringify(value), schema);
  }

  private getValidator(schema: AiJsonObject): ValidateFunction {
    const fingerprint = JSON.stringify(schema);
    const cached = this.validators.get(fingerprint);
    if (cached) return cached;

    try {
      const validate = this.ajv.compile(schema);
      this.validators.set(fingerprint, validate);
      return validate;
    } catch {
      throw schemaError();
    }
  }
}

function containsUnsafeText(value: unknown): boolean {
  if (typeof value === "string") return UNSAFE_TEXT_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsUnsafeText);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(containsUnsafeText);
  }
  return false;
}

function formatValidationMessage(errors: ErrorObject[]): string {
  const path = errors[0]?.instancePath || "ответ";
  return `Ответ AI не соответствует схеме: ${path}`;
}

function invalidOutput(): AiProviderError {
  return new AiProviderError(
    "AI_OUTPUT_INVALID",
    "AI вернул некорректный структурированный ответ",
  );
}

function schemaError(): AiProviderError {
  return new AiProviderError(
    "AI_OUTPUT_SCHEMA_INVALID",
    "Некорректная схема структурированного ответа AI",
  );
}
