import type {
  TemplateAnswerValidationError,
} from "@max-contract/contracts";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const SUPPORTED_FIELD_TYPES = new Set(["boolean", "integer", "number", "string"]);

@Injectable()
export class TemplateSchemaValidator {
  private readonly ajv: Ajv2020;
  private readonly compiledSchemas = new Map<
    string,
    { fingerprint: string; validate: ValidateFunction }
  >();

  constructor() {
    this.ajv = new Ajv2020({
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      strict: true,
    });
    addFormats(this.ajv);
  }

  assertSchema(
    templateVersionId: string,
    schema: Record<string, unknown>,
  ): void {
    this.getValidator(templateVersionId, schema);
  }

  validateAnswers(
    templateVersionId: string,
    schema: Record<string, unknown>,
    answers: Record<string, unknown>,
  ): TemplateAnswerValidationError[] {
    const validate = this.getValidator(templateVersionId, schema);
    return validate(answers) ? [] : mapValidationErrors(validate.errors ?? []);
  }

  private getValidator(
    templateVersionId: string,
    schema: Record<string, unknown>,
  ): ValidateFunction {
    const fingerprint = JSON.stringify(schema);
    const cached = this.compiledSchemas.get(templateVersionId);
    if (cached?.fingerprint === fingerprint) {
      return cached.validate;
    }

    assertRenderableQuestionnaire(schema);

    try {
      const validate = this.ajv.compile(schema);
      this.compiledSchemas.set(templateVersionId, { fingerprint, validate });
      return validate;
    } catch {
      throw invalidTemplateSchema();
    }
  }
}

function assertRenderableQuestionnaire(schema: Record<string, unknown>): void {
  if (
    schema.type !== "object" ||
    !isRecord(schema.properties) ||
    schema.additionalProperties !== false
  ) {
    throw invalidTemplateSchema();
  }

  for (const field of Object.values(schema.properties)) {
    if (
      !isRecord(field) ||
      typeof field.title !== "string" ||
      field.title.trim().length === 0 ||
      typeof field.type !== "string" ||
      !SUPPORTED_FIELD_TYPES.has(field.type)
    ) {
      throw invalidTemplateSchema();
    }

    if (
      field.enum !== undefined &&
      (field.type !== "string" ||
        !Array.isArray(field.enum) ||
        field.enum.length === 0 ||
        field.enum.some((value) => typeof value !== "string"))
    ) {
      throw invalidTemplateSchema();
    }
  }
}

function mapValidationErrors(
  errors: ErrorObject[],
): TemplateAnswerValidationError[] {
  return errors.map((error) => ({
    message: validationMessage(error),
    path: validationPath(error),
  }));
}

function validationPath(error: ErrorObject): string {
  if (error.keyword === "required") {
    return String(error.params.missingProperty ?? "");
  }
  if (error.keyword === "additionalProperties") {
    return String(error.params.additionalProperty ?? "");
  }

  return error.instancePath
    .replace(/^\//, "")
    .split("/")
    .map(decodeJsonPointerSegment)
    .join(".");
}

function validationMessage(error: ErrorObject): string {
  switch (error.keyword) {
    case "required":
      return "Заполните обязательное поле";
    case "additionalProperties":
      return "Поле отсутствует в анкете";
    case "type":
      return "Некорректный тип значения";
    case "minLength":
      return "Значение слишком короткое";
    case "maxLength":
      return "Значение слишком длинное";
    case "minimum":
      return "Значение меньше допустимого";
    case "maximum":
      return "Значение больше допустимого";
    case "format":
      return "Некорректный формат";
    case "enum":
      return "Выберите значение из списка";
    default:
      return "Некорректное значение";
  }
}

function decodeJsonPointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidTemplateSchema(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: "TEMPLATE_SCHEMA_INVALID",
    message: "Схема опубликованного шаблона повреждена",
  });
}
