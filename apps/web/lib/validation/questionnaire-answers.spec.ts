import type { QuestionnaireDefinition } from "./questionnaire-answers";
import { normalizeQuestionnaireAnswers } from "./questionnaire-answers";

describe("normalizeQuestionnaireAnswers", () => {
  it.each([
    ["+1", 1],
    ["75 000,50", 75_000.5],
    ["75\u00a0000.50", 75_000.5],
    ["75\u202f000", 75_000],
    [".5", 0.5],
    ["-,5", -0.5],
    ["001", 1],
  ])("normalizes a localized number %s", (raw, expected) => {
    expect(normalizeQuestionnaireAnswers(unboundedNumberDefinition(), { amount: raw }))
      .toEqual({ answers: { amount: expected }, errors: {} });
  });

  it.each(["++1", "1e3", "1.2.3", "12-3", "NaN", "Infinity", "1,"])(
    "rejects an ambiguous number %s",
    (raw) => {
      expect(normalizeQuestionnaireAnswers(numberDefinition(), { amount: raw }))
        .toEqual({
          answers: {},
          errors: { amount: "Введите число" },
        });
    },
  );

  it("distinguishes an invalid integer from an invalid number", () => {
    expect(
      normalizeQuestionnaireAnswers(integerDefinition(), { count: "1,5" }),
    ).toEqual({
      answers: {},
      errors: { count: "Введите целое число" },
    });
  });

  it("rejects an integer outside the safe range", () => {
    expect(
      normalizeQuestionnaireAnswers(integerDefinition(), {
        count: "9007199254740992",
      }),
    ).toEqual({
      answers: {},
      errors: { count: "Число слишком большое" },
    });
  });

  it("applies schema minimum and maximum before the API request", () => {
    expect(normalizeQuestionnaireAnswers(numberDefinition(), { amount: "-1" }))
      .toEqual({
        answers: {},
        errors: { amount: "Значение меньше допустимого" },
      });
    expect(normalizeQuestionnaireAnswers(numberDefinition(), { amount: "1000001" }))
      .toEqual({
        answers: {},
        errors: { amount: "Значение больше допустимого" },
      });
  });

  it("reports an empty required value and omits empty optional values", () => {
    const definition: QuestionnaireDefinition = {
      fields: [
        { key: "amount", required: true, title: "Сумма", type: "number" },
        { key: "comment", required: false, title: "Комментарий", type: "string" },
      ],
      title: null,
    };

    expect(
      normalizeQuestionnaireAnswers(definition, { amount: "", comment: "" }),
    ).toEqual({
      answers: {},
      errors: { amount: "Заполните обязательное поле" },
    });
  });
});

function numberDefinition(): QuestionnaireDefinition {
  return {
    fields: [
      {
        key: "amount",
        maximum: 1_000_000,
        minimum: 0,
        required: true,
        title: "Сумма",
        type: "number",
      },
    ],
    title: null,
  };
}

function unboundedNumberDefinition(): QuestionnaireDefinition {
  return {
    fields: [
      { key: "amount", required: true, title: "Сумма", type: "number" },
    ],
    title: null,
  };
}

function integerDefinition(): QuestionnaireDefinition {
  return {
    fields: [
      { key: "count", required: true, title: "Количество", type: "integer" },
    ],
    title: null,
  };
}
