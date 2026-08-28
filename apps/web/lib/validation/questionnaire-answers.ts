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
  required: boolean;
  title: string;
  type: QuestionnaireFieldType;
}

export interface QuestionnaireDefinition {
  fields: QuestionnaireField[];
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

    answers[field.key] = rawValue;
  }

  return { answers, errors };
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
  return value === undefined || value === null || value === "";
}
