import { normalizeContractDraft } from "./contract-draft-presentation";

describe("contract draft presentation", () => {
  it("removes model markup and an empty technical placeholder without changing conditions", () => {
    const clause = "Проценты — 5% годовых. Возврат 20.02.2070.";
    const draft = {
      title: "**Договор**",
      preamble: "Стороны",
      warnings: [],
      sections: [
        {
          heading: "## Условия",
          clauses: ["typeSectionTitle: ", `**Ставка:**\n${clause}`],
        },
        { heading: "Оплата", clauses: ["50 000 рублей"] },
        { heading: "Передача", clauses: ["Банковский перевод"] },
      ],
    };
    expect(normalizeContractDraft(draft)).toMatchObject({
      title: "Договор",
      sections: [
        { heading: "Условия", clauses: [`Ставка:\n${clause}`] },
        { heading: "Оплата", clauses: ["50 000 рублей"] },
        { heading: "Передача", clauses: ["Банковский перевод"] },
      ],
    });
    expect(draft.title).toBe("**Договор**");
  });
  it("refuses a draft reduced to empty sections", () => {
    expect(() =>
      normalizeContractDraft({
        title: "Договор",
        preamble: "",
        warnings: [],
        sections: [{ heading: "Раздел", clauses: ["typeSectionTitle:"] }],
      }),
    ).toThrow("CONTRACT_DRAFT_EMPTY_SECTIONS");
  });

  it("leaves numbering to the PDF renderer, preserving amounts and clause text", () => {
    const result = normalizeContractDraft({ title: "Договор", preamble: "", warnings: [], sections: [
      { heading: "1. Предмет договора", clauses: ["**1. Предмет договора.**\n1.1. Ноутбук за 25 000 рублей."] },
      { heading: "2. Срок", clauses: ["20.02.2070 — дата возврата."] },
      { heading: "3. Оплата", clauses: ["50 000 рублей."] },
    ] });
    expect(result.sections[0]).toEqual({ heading: "Предмет договора", clauses: ["Ноутбук за 25 000 рублей."] });
    expect(result.sections[1]?.clauses).toEqual(["20.02.2070 — дата возврата."]);
    expect(result.sections[2]?.clauses).toEqual(["50 000 рублей."]);
  });
});
