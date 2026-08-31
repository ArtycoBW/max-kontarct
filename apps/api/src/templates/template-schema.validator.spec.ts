import { InternalServerErrorException } from "@nestjs/common";

import { TemplateSchemaValidator } from "./template-schema.validator";

describe("TemplateSchemaValidator", () => {
  let validator: TemplateSchemaValidator;

  beforeEach(() => {
    validator = new TemplateSchemaValidator();
  });

  it("accepts answers that match a renderable JSON Schema", () => {
    expect(
      validator.validateAnswers("version-1", questionnaireSchema(), {
        amount: 75_000,
        subject: "Нежилое помещение",
      }),
    ).toEqual([]);
  });

  it("returns Russian field errors without changing the answers", () => {
    const answers = { amount: "75000", extra: true };

    expect(
      validator.validateAnswers("version-1", questionnaireSchema(), answers),
    ).toEqual(
      expect.arrayContaining([
        { message: "Заполните обязательное поле", path: "subject" },
        { message: "Некорректный тип значения", path: "amount" },
        { message: "Поле отсутствует в анкете", path: "extra" },
      ]),
    );
    expect(answers).toEqual({ amount: "75000", extra: true });
  });

  it("rejects a valid JSON Schema that the questionnaire UI cannot render", () => {
    expect(() =>
      validator.assertSchema("version-1", {
        additionalProperties: false,
        properties: {
          participants: { items: { type: "string" }, title: "Участники", type: "array" },
        },
        type: "object",
      }),
    ).toThrow(InternalServerErrorException);
  });

  it("rejects an invalid JSON Schema", () => {
    expect(() =>
      validator.assertSchema("version-1", {
        additionalProperties: false,
        properties: {
          subject: { minLength: -1, title: "Предмет", type: "string" },
        },
        type: "object",
      }),
    ).toThrow(InternalServerErrorException);
  });

  it("enforces date order and conditional requirements", () => {
    const start = addUtcDays(currentUtcDateOnly(), 2);
    const end = addUtcDays(currentUtcDateOnly(), 1);
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
      properties: {
        end: { format: "date", title: "Окончание", type: "string" },
        interestRate: { minimum: 0.01, title: "Ставка", type: "number" },
        interestType: { enum: ["Без процентов", "С процентами"], title: "Проценты", type: "string" },
        start: { format: "date", title: "Начало", type: "string" },
      },
      required: ["start", "end", "interestType"],
      type: "object",
      "x-fieldOrder": ["start", "end", "interestType", "interestRate"],
      "x-rules": [
        { endField: "end", kind: "dateOrder", startField: "start" },
        { dependsOn: "interestType", equals: "С процентами", field: "interestRate", kind: "requiredWhen", message: "Укажите процентную ставку" },
      ],
    };

    expect(validator.validateAnswers("version-rules", schema, {
      end,
      interestType: "С процентами",
      start,
    })).toEqual([
      { message: "Дата окончания не может быть раньше даты начала", path: "end" },
      { message: "Укажите процентную ставку", path: "interestRate" },
    ]);
  });

  it("rejects contract dates in the past", () => {
    const yesterday = addUtcDays(currentUtcDateOnly(), -1);
    const schema = {
      additionalProperties: false,
      properties: {
        end: { format: "date", title: "Окончание", type: "string" },
        start: { format: "date", title: "Начало", type: "string" },
      },
      required: ["start", "end"],
      type: "object",
      "x-rules": [
        { endField: "end", kind: "dateOrder", startField: "start" },
      ],
    };

    expect(
      validator.validateAnswers("version-past-dates", schema, {
        end: yesterday,
        start: yesterday,
      }),
    ).toEqual([
      { message: "Дата не может быть раньше сегодняшней", path: "start" },
      { message: "Дата не может быть раньше сегодняшней", path: "end" },
    ]);
  });

  it("rejects incomplete presentation metadata", () => {
    expect(() =>
      validator.assertSchema("version-order", {
        additionalProperties: false,
        properties: {
          amount: { title: "Сумма", type: "number" },
          subject: { title: "Предмет", type: "string" },
        },
        type: "object",
        "x-fieldOrder": ["subject"],
      }),
    ).toThrow(InternalServerErrorException);
  });
});

function questionnaireSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {
      amount: { minimum: 0, title: "Сумма", type: "number" },
      subject: { minLength: 1, title: "Предмет", type: "string" },
    },
    required: ["subject", "amount"],
    type: "object",
  };
}

function currentUtcDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
