import type {
  TemplateAnswerValidationError,
} from "@max-contract/contracts";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const SUPPORTED_FIELD_TYPES = new Set(["boolean", "integer", "number", "string"]);
const PRESENTATION_KEYWORDS = ["x-fieldOrder", "x-rules"] as const;

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
    for (const keyword of PRESENTATION_KEYWORDS) {
      this.ajv.addKeyword({ keyword, valid: true });
    }
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
    const schemaErrors = validate(answers)
      ? []
      : mapValidationErrors(validate.errors ?? []);
    return [
      ...schemaErrors,
      ...validateDateFields(schema, answers, schemaErrors),
      ...validateCrossFieldRules(schema, answers, schemaErrors),
    ];
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

  const properties = schema.properties;
  for (const field of Object.values(properties)) {
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

  assertFieldOrder(schema["x-fieldOrder"], properties);
  assertCrossFieldRules(schema["x-rules"], properties);
}

function assertFieldOrder(
  rawOrder: unknown,
  properties: Record<string, unknown>,
): void {
  if (rawOrder === undefined) return;
  if (
    !Array.isArray(rawOrder) ||
    rawOrder.length !== Object.keys(properties).length ||
    rawOrder.some((key) => typeof key !== "string" || !(key in properties)) ||
    new Set(rawOrder).size !== rawOrder.length
  ) {
    throw invalidTemplateSchema();
  }
}

function assertCrossFieldRules(
  rawRules: unknown,
  properties: Record<string, unknown>,
): void {
  if (rawRules === undefined) return;
  if (!Array.isArray(rawRules)) throw invalidTemplateSchema();

  for (const rule of rawRules) {
    if (!isRecord(rule) || typeof rule.kind !== "string") {
      throw invalidTemplateSchema();
    }
    if (rule.kind === "dateOrder") {
      if (
        typeof rule.startField !== "string" ||
        typeof rule.endField !== "string" ||
        !isDateField(properties[rule.startField]) ||
        !isDateField(properties[rule.endField]) ||
        (rule.message !== undefined && typeof rule.message !== "string")
      ) {
        throw invalidTemplateSchema();
      }
      continue;
    }
    if (rule.kind === "requiredWhen") {
      if (
        typeof rule.field !== "string" ||
        typeof rule.dependsOn !== "string" ||
        !(rule.field in properties) ||
        !(rule.dependsOn in properties) ||
        !["boolean", "number", "string"].includes(typeof rule.equals) ||
        (rule.message !== undefined && typeof rule.message !== "string")
      ) {
        throw invalidTemplateSchema();
      }
      continue;
    }
    throw invalidTemplateSchema();
  }
}

function validateCrossFieldRules(
  schema: Record<string, unknown>,
  answers: Record<string, unknown>,
  schemaErrors: TemplateAnswerValidationError[],
): TemplateAnswerValidationError[] {
  const rules = schema["x-rules"];
  if (!Array.isArray(rules)) return [];
  const invalidPaths = new Set(schemaErrors.map(({ path }) => path));
  const errors: TemplateAnswerValidationError[] = [];

  for (const rawRule of rules) {
    if (!isRecord(rawRule)) continue;
    if (rawRule.kind === "dateOrder") {
      const startField = String(rawRule.startField);
      const endField = String(rawRule.endField);
      const start = answers[startField];
      const end = answers[endField];
      if (
        !invalidPaths.has(startField) &&
        !invalidPaths.has(endField) &&
        typeof start === "string" &&
        typeof end === "string" &&
        end < start
      ) {
        errors.push({
          message:
            typeof rawRule.message === "string"
              ? rawRule.message
              : "Дата окончания не может быть раньше даты начала",
          path: endField,
        });
      }
      continue;
    }
    if (rawRule.kind === "requiredWhen") {
      const field = String(rawRule.field);
      const dependsOn = String(rawRule.dependsOn);
      if (
        answers[dependsOn] === rawRule.equals &&
        isEmptyValue(answers[field]) &&
        !invalidPaths.has(field)
      ) {
        errors.push({
          message:
            typeof rawRule.message === "string"
              ? rawRule.message
              : "Заполните обязательное поле",
          path: field,
        });
      }
    }
  }
  return errors;
}

function validateDateFields(
  schema: Record<string, unknown>,
  answers: Record<string, unknown>,
  schemaErrors: TemplateAnswerValidationError[],
): TemplateAnswerValidationError[] {
  if (!isRecord(schema.properties)) return [];
  const invalidPaths = new Set(schemaErrors.map(({ path }) => path));
  const today = currentDateOnly();
  const errors: TemplateAnswerValidationError[] = [];

  for (const [path, field] of Object.entries(schema.properties)) {
    const value = answers[path];
    if (
      isDateField(field) &&
      !invalidPaths.has(path) &&
      typeof value === "string" &&
      value < today
    ) {
      errors.push({
        message: "Дата не может быть раньше сегодняшней",
        path,
      });
    }
  }

  return errors;
}

function currentDateOnly(): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  const day = parts.find(({ type }) => type === "day")?.value;
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function isDateField(value: unknown): boolean {
  return isRecord(value) && value.type === "string" && value.format === "date";
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
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
    case "pattern":
      return "Введите значение в указанном формате";
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
