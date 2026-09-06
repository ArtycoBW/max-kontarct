import {
  confirmedContractTerms,
  withConfirmedContractTerms,
} from "./contract-confirmed-terms";

describe("confirmed contract terms", () => {
  const schema = {
    properties: {
      price: { title: "Цена, ₽" },
      transferDate: { title: "Дата передачи", format: "date" },
      paymentMethod: { title: "Способ оплаты" },
      earlyRepaymentAllowed: { title: "Досрочный возврат разрешён" },
      interestRate: { title: "Процентная ставка, % годовых" },
      interestType: { title: "Условия займа" },
    },
  };
  it("preserves sale amount, date and payment method even when AI omitted them", () => {
    const terms = confirmedContractTerms(
      schema,
      {
        price: 25000,
        transferDate: "2070-01-20",
        paymentMethod: "Банковский перевод",
      },
      {},
      [],
    );
    expect(terms).toEqual([
      "Цена, ₽: 25 000.",
      "Дата передачи: 20.01.2070.",
      "Способ оплаты: Банковский перевод.",
    ]);
    const draft = {
      title: "Договор",
      preamble: "Стороны",
      warnings: [],
      sections: [{ heading: "Предмет", clauses: ["Ноутбук"] }],
    };
    expect(withConfirmedContractTerms(draft, terms).sections[0]).toEqual({
      heading: "Условия сделки",
      clauses: terms,
    });
    expect(draft.sections).toHaveLength(1);
  });
  it("keeps annual rate units, false and zero, without inventing defaults", () => {
    expect(
      confirmedContractTerms(
        schema,
        { price: 0, earlyRepaymentAllowed: false, interestRate: 5 },
        {},
        [],
      ),
    ).toEqual([
      "Цена, ₽: 0.",
      "Досрочный возврат разрешён: Нет.",
      "Процентная ставка, % годовых: 5.",
    ]);
  });
  it("renders option labels instead of opaque values and replaces vague original place", () => {
    const history = [
      {
        id: "termsLocation",
        label: "Где?",
        description: "",
        type: "single_choice" as const,
        required: true,
        options: [{ value: "remote", label: "Онлайн" }],
      },
    ];
    expect(
      confirmedContractTerms(
        { properties: { workLocation: { title: "Место" } } },
        { workLocation: "У заказчика" },
        { termsLocation: "remote" },
        history,
      ),
    ).toEqual(["Место исполнения: Онлайн."]);
  });
  it("rejects missing labels rather than silently losing a condition", () => {
    expect(() => confirmedContractTerms({}, { price: 100 }, {}, [])).toThrow(
      "CONTRACT_FIELD_LABEL_MISSING",
    );
    expect(() =>
      confirmedContractTerms({}, {}, { unknown: "value" }, []),
    ).toThrow("CONTRACT_ANSWER_LABEL_MISSING");
  });
  it("omits a hidden interest rate for an interest-free loan", () => {
    expect(
      confirmedContractTerms(
        schema,
        { interestType: "Беспроцентный", interestRate: 5 },
        {},
        [],
      ),
    ).toEqual(["Условия займа: Беспроцентный."]);
  });
  it("chunks large questionnaires without dropping terms", () => {
    const terms = Array.from({ length: 43 }, (_, index) => `Условие ${index}`);
    const result = withConfirmedContractTerms(
      { title: "Договор", preamble: "", warnings: [], sections: [] },
      terms,
    );
    expect(result.sections.map((section) => section.clauses.length)).toEqual([
      20, 20, 3,
    ]);
    expect(result.sections.flatMap((section) => section.clauses)).toEqual(
      terms,
    );
  });
});
