import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { invalidRequiredTermAnswers, knownContractTerms, missingContractTerms } from "./contract-completeness";

type Case = { slug: string; input: Record<string, unknown>; answers: Record<string, string>; completeField: string };
const cases = JSON.parse(readFileSync(resolve(__dirname, "../../../../tests/fixtures/contract-cases.json"), "utf8")) as Case[];
describe("Contract completeness: all five templates", () => {
  it.each(cases)("$slug: cannot silently pass a minimal questionnaire", item => {
    expect(missingContractTerms(item.slug, item.input).map(question => question.id)).toEqual(Object.keys(item.answers));
    expect(missingContractTerms(item.slug, item.input).every(question => question.required)).toBe(true);
  });
  it.each(cases)("$slug: accepts explicit answers and never repeats them", item => {
    expect(invalidRequiredTermAnswers(item.slug, item.input, item.answers)).toEqual([]);
    expect(missingContractTerms(item.slug, item.input, item.answers)).toEqual([]);
    expect(knownContractTerms(item.slug, item.input, item.answers)).toHaveLength(Object.keys(item.answers).length);
  });
  it.each(cases)("$slug: recognizes facts already in free text", item => {
    const input = { ...item.input, [item.completeField]: `${String(item.input[item.completeField])}. ${Object.values(item.answers).join(". ")}` };
    expect(missingContractTerms(item.slug, input)).toEqual([]);
  });
  it.each(["", "  ", "не знаю", "потом", "по согласованию", "как обычно", "да", "нет"])("rejects vague mandatory answer %j without creating a repeated question", text => {
    const item = cases[0]!;
    for (const id of Object.keys(item.answers)) {
      expect(invalidRequiredTermAnswers(item.slug, item.input, { [id]: text })).toEqual([expect.objectContaining({ path: id })]);
    }
  });
  it("does not count price/payment text as an address", () => {
    expect(missingContractTerms("work-contract", { workLocation: "Квартира собственника", workDescription: "Ремонт ванной за 30000 рублей. Оплата после 5 дней", materialsIncluded: true }).map(item => item.id)).toContain("termsLocation");
  });
  it.each(["Ростов-на-Дону Нансена 109", "Москва, ул. Примерная, д. 10", "Онлайн", "Дистанционно по видеосвязи"])("does not repeat a concrete location: %s", workLocation => {
    expect(missingContractTerms("work-contract", { workLocation, materialsIncluded: true }).map(item => item.id)).not.toContain("termsLocation");
  });
  it("does not treat online as identification of a rental property", () => {
    expect(missingContractTerms("property-rental", { propertyDescription: "Онлайн" }).map(item => item.id)).toContain("termsProperty");
  });
  it("requires materials terms only when separately paid", () => {
    const item = cases[0]!;
    expect(missingContractTerms(item.slug, { ...item.input, materialsIncluded: false }, item.answers).map(question => question.id)).toEqual(["termsMaterials"]);
  });
  it("keeps false and zero answers as facts, without unnecessary conditional questions", () => {
    expect(missingContractTerms("property-rental", { utilitiesIncluded: true, depositAmount: 0 }).map(item => item.id)).not.toEqual(expect.arrayContaining(["termsDeposit", "termsUtilities"]));
    expect(missingContractTerms("personal-loan", { interestType: "Без процентов", interestRate: 0, earlyRepaymentAllowed: false }).map(item => item.id)).not.toContain("termsInterest");
  });
  it("partial prepayment is insufficient without the balance", () => {
    expect(invalidRequiredTermAnswers("work-contract", {}, { termsPayment: "Предоплата 50%" })).toHaveLength(1);
    expect(invalidRequiredTermAnswers("work-contract", {}, { termsPayment: "После завершения работ" })).toEqual([]);
    expect(invalidRequiredTermAnswers("work-contract", {}, { termsPayment: "Предоплата 100%" })).toEqual([]);
  });
  it("distinguishes a loan amount from its transfer date", () => {
    expect(invalidRequiredTermAnswers("personal-loan", {}, { termsLoanTransfer: "Банковский перевод 30000 рублей" })).toHaveLength(1);
  });
  it("does not invent a policy for a custom template", () => expect(missingContractTerms("custom-template", {})).toEqual([]));
  it("does not confuse the property description with an unspecified payment method", () => {
    const input = { propertyDescription: "Новый ноутбук в комплекте с зарядкой", paymentMethod: "Иной согласованный способ" };
    expect(missingContractTerms("movable-property-sale", input).map(question => question.id)).toContain("termsPaymentMethod");
    expect(invalidRequiredTermAnswers("movable-property-sale", input, { termsPaymentMethod: "СБП" })).toEqual([]);
  });
});
