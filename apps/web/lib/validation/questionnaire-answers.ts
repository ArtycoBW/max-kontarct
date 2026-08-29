export type QuestionnaireFieldType =
  | "boolean"
  | "integer"
  | "number"
  | "string";

export interface QuestionnaireField {
  description?: string;
  enum?: string[];
  format?: string;
  key: string;
  maxLength?: number;
  maximum?: number;
  minLength?: number;
  minimum?: number;
  pattern?: string;
  required: boolean;
  title: string;
  type: QuestionnaireFieldType;
}

export type QuestionnaireRule =
  | {
      endField: string;
      kind: "dateOrder";
      message?: string;
      startField: string;
    }
  | {
      dependsOn: string;
      equals: boolean | number | string;
      field: string;
      kind: "requiredWhen";
      message?: string;
    };

export interface QuestionnaireDefinition {
  fields: QuestionnaireField[];
  rules: QuestionnaireRule[];
  title: string | null;
}

export interface NormalizedQuestionnaireAnswers {
  answers: Record<string, unknown>;
  errors: Record<string, string>;
}

export function normalizeQuestionnaireAnswers(
  definition: QuestionnaireDefinition,
  rawAnswers: Record<string, unknown>,
): NormalizedQuestionnaireAnswers {
  const answers: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of definition.fields) {
    const rawValue = rawAnswers[field.key];
    if (isEmptyValue(rawValue)) {
      if (field.required) {
        errors[field.key] = "Заполните обязательное поле";
      }
      continue;
    }

    if (field.type === "number" || field.type === "integer") {
      const normalized = normalizeNumber(rawValue, field.type);
      if (!normalized.ok) {
        errors[field.key] = normalized.error;
      } else if (
        field.minimum !== undefined &&
        normalized.value < field.minimum
      ) {
        errors[field.key] = "Значение меньше допустимого";
      } else if (
        field.maximum !== undefined &&
        normalized.value > field.maximum
      ) {
        errors[field.key] = "Значение больше допустимого";
      } else {
        answers[field.key] = normalized.value;
      }
      continue;
    }

    if (field.type === "boolean") {
      if (typeof rawValue !== "boolean") {
        errors[field.key] = "Выберите да или нет";
      } else {
        answers[field.key] = rawValue;
      }
      continue;
    }

    if (typeof rawValue !== "string") {
      errors[field.key] = "Введите текстовое значение";
      continue;
    }
    const normalizedValue = rawValue.trim();
    if (field.minLength !== undefined && normalizedValue.length < field.minLength) {
      errors[field.key] = `Введите не менее ${field.minLength} символов`;
    } else if (
      field.maxLength !== undefined &&
      normalizedValue.length > field.maxLength
    ) {
      errors[field.key] = `Введите не более ${field.maxLength} символов`;
    } else if (field.enum && !field.enum.includes(normalizedValue)) {
      errors[field.key] = "Выберите значение из списка";
    } else if (field.format === "date" && !isDateOnly(normalizedValue)) {
      errors[field.key] = "Укажите корректную дату";
    } else if (field.format === "email" && !isEmail(normalizedValue)) {
      errors[field.key] = "Укажите корректный email";
    } else if (field.pattern && !matchesPattern(normalizedValue, field.pattern)) {
      errors[field.key] = "Введите значение в указанном формате";
    } else {
      answers[field.key] = normalizedValue;
    }
  }

  applyCrossFieldRules(definition, rawAnswers, answers, errors);

  return { answers, errors };
}

function applyCrossFieldRules(
  definition: QuestionnaireDefinition,
  rawAnswers: Record<string, unknown>,
  answers: Record<string, unknown>,
  errors: Record<string, string>,
): void {
  for (const rule of definition.rules) {
    if (rule.kind === "dateOrder") {
      const start = answers[rule.startField];
      const end = answers[rule.endField];
      if (
        typeof start === "string" &&
        typeof end === "string" &&
        isDateOnly(start) &&
        isDateOnly(end) &&
        end < start
      ) {
        errors[rule.endField] =
          rule.message ?? "Дата окончания не может быть раньше даты начала";
      }
      continue;
    }
    if (
      rawAnswers[rule.dependsOn] === rule.equals &&
      isEmptyValue(rawAnswers[rule.field])
    ) {
      errors[rule.field] = rule.message ?? "Заполните обязательное поле";
    }
  }
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "u").test(value);
  } catch {
    return false;
  }
}

function normalizeNumber(
  rawValue: unknown,
  type: "integer" | "number",
): { error: string; ok: false } | { ok: true; value: number } {
  if (typeof rawValue === "number") {
    return validateNumber(rawValue, type);
  }
  if (typeof rawValue !== "string") {
    return { error: "Введите число", ok: false };
  }

  const compact = rawValue.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(compact)) {
    return {
      error:
        type === "integer" && /^[+-]?\d+[.,]\d+$/.test(compact)
          ? "Введите целое число"
          : "Введите число",
      ok: false,
    };
  }

  return validateNumber(Number(compact.replace(",", ".")), type);
}

function validateNumber(
  value: number,
  type: "integer" | "number",
): { error: string; ok: false } | { ok: true; value: number } {
  if (!Number.isFinite(value)) {
    return { error: "Число слишком большое", ok: false };
  }
  if (type === "integer" && !Number.isInteger(value)) {
    return { error: "Введите целое число", ok: false };
  }
  if (type === "integer" && !Number.isSafeInteger(value)) {
    return { error: "Число слишком большое", ok: false };
  }
  return { ok: true, value };
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}
