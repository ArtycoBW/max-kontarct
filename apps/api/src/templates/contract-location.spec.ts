import { contractLocationIssue } from "./contract-location";
import { missingContractTerms, invalidRequiredTermAnswers } from "./contract-completeness";

describe("contract location syntax", () => {
  it.each([
    "Казань Примерная 10", "Тверь, Примерная, 10", "Дербент Буйнакского 68",
    "г. Омск, ул. Примерная, д. 8А, корп. 2", "п. Берёзовый, дом 3",
    "Москва, проспект Примерный, 4/2", "Онлайн", "Удалённо, файл по почте",
  ])("accepts supplied locations without asking them again: %s", text => {
    expect(contractLocationIssue(text)).toBeNull();
    expect(missingContractTerms("work-contract", { workLocation: text }).map(q => q.id)).not.toContain("termsLocation");
  });
  it.each([
    ["ул. Примерная, д. 8", "населённый пункт"],
    ["г. Казань, ул. Примерная", "номер дома"],
    ["по согласованию", "конкретного места"],
  ])("explains the missing part instead of repeating the question: %s", (text, reason) => {
    const errors = invalidRequiredTermAnswers("work-contract", {}, { termsLocation: text });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(reason);
    expect(errors[0]?.message).toContain("Например:");
  });
  it.each(["Работы стоимостью 10000 рублей", "Оплата через 5 дней", "Квартира собственника"])("does not turn unrelated text into an address: %s", text => {
    expect(contractLocationIssue(text)).not.toBeNull();
  });
  it("does not require an apartment and keeps a supplied clarification", () => {
    expect(missingContractTerms("work-contract", { workLocation: "У заказчика" }, { termsLocation: "Казань Примерная 10" }).map(q => q.id)).not.toContain("termsLocation");
  });
  it("finds the address after a property description in the same sentence", () => {
    expect(missingContractTerms("property-rental", { propertyDescription: "Комната с мебелью, Москва, улица Примерная, дом 10, квартира 2. Оплата ежедневно утром." }).map(q => q.id)).not.toContain("termsProperty");
  });
});
