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
