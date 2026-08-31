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
      rules: [],
      title: null,
    };

    expect(
      normalizeQuestionnaireAnswers(definition, { amount: "", comment: "" }),
    ).toEqual({
      answers: {},
      errors: { amount: "Заполните обязательное поле" },
    });
  });

  it("trims strings and validates their length, format and enum", () => {
    const definition: QuestionnaireDefinition = {
      fields: [
        { key: "subject", minLength: 5, maxLength: 20, required: true, title: "Предмет", type: "string" },
        { key: "date", format: "date", required: true, title: "Дата", type: "string" },
        { enum: ["Да", "Нет"], key: "choice", required: true, title: "Выбор", type: "string" },
      ],
      rules: [],
      title: null,
    };

    expect(normalizeQuestionnaireAnswers(definition, {
      choice: "Другое",
      date: "2026-02-31",
      subject: "  дом  ",
    })).toEqual({
      answers: {},
      errors: {
        choice: "Выберите значение из списка",
        date: "Укажите корректную дату",
        subject: "Введите не менее 5 символов",
      },
    });
  });

  it("validates date order and a conditionally required field", () => {
    const start = addLocalDays(2);
    const end = addLocalDays(1);
    const definition: QuestionnaireDefinition = {
      fields: [
        { format: "date", key: "start", required: true, title: "Начало", type: "string" },
        { format: "date", key: "end", required: true, title: "Окончание", type: "string" },
        { enum: ["Без процентов", "С процентами"], key: "interestType", required: true, title: "Проценты", type: "string" },
        { key: "interestRate", minimum: 0.01, required: false, title: "Ставка", type: "number" },
      ],
      rules: [
        { endField: "end", kind: "dateOrder", startField: "start" },
        { dependsOn: "interestType", equals: "С процентами", field: "interestRate", kind: "requiredWhen", message: "Укажите процентную ставку" },
      ],
      title: null,
    };

    expect(normalizeQuestionnaireAnswers(definition, {
      end,
      interestType: "С процентами",
      start,
    })).toEqual({
      answers: {
        end,
        interestType: "С процентами",
        start,
      },
      errors: {
        end: "Дата окончания не может быть раньше даты начала",
        interestRate: "Укажите процентную ставку",
      },
    });
  });

  it("rejects a standalone contract date in the past", () => {
    const definition: QuestionnaireDefinition = {
      fields: [
        {
          format: "date",
          key: "completionDate",
          required: true,
          title: "Срок оказания услуги",
          type: "string",
        },
      ],
      rules: [],
      title: null,
    };

    expect(
      normalizeQuestionnaireAnswers(definition, {
        completionDate: addLocalDays(-1),
      }),
    ).toEqual({
      answers: {},
      errors: {
        completionDate: "Дата не может быть раньше сегодняшней",
      },
    });
  });
});

function addLocalDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
    rules: [],
    title: null,
  };
}

function unboundedNumberDefinition(): QuestionnaireDefinition {
  return {
    fields: [
      { key: "amount", required: true, title: "Сумма", type: "number" },
    ],
    rules: [],
    title: null,
  };
}

function integerDefinition(): QuestionnaireDefinition {
  return {
    fields: [
      { key: "count", required: true, title: "Количество", type: "integer" },
    ],
    rules: [],
    title: null,
  };
}
