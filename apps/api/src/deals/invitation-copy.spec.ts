import { invitationMessage, invitationPrice, invitationSubject } from "./invitation-copy";

describe("invitation summary", () => {
  it("replaces a generic services title with the concrete confirmed service", () => {
    const result = invitationMessage({ firstName: "Иван", title: "Оказание услуг", templateTitle: "Оказание услуг", slug: "paid-services", description: "Презентация для сайта", answers: { serviceDescription: "Создание презентации для сайта", paymentAmount: 10000 } });
    expect(result).toContain("Предмет: Создание презентации для сайта");
    expect(result).toContain("10 000 ₽");
  });
  it("does not publish private details embedded in a service description", () => {
    const result = invitationMessage({ firstName: "Иван", title: "Оказание услуг", templateTitle: "Оказание услуг", slug: "paid-services", description: "Мой паспорт 1234 567890", answers: { serviceDescription: "Телефон +79990000000", paymentAmount: 10000 } });
    expect(result).not.toMatch(/567890|79990000000/);
  });
  it("includes the sender, concrete subject and price but not arbitrary answer fields", () => {
    const result = invitationMessage({ firstName: "Иван", title: "Ремонт ноутбука", templateTitle: "Выполнение работ", slug: "work-contract", answers: { price: 15000, phone: "+79990000000", passport: "9999 111111", address: "Личный адрес" } });
    expect(result).toContain("Иван приглашает");
    expect(result).toContain("Ремонт ноутбука");
    expect(result).toContain("15 000 ₽");
    expect(result).not.toMatch(/79990000000|111111|Личный адрес/);
  });
  it("never substitutes a missing price with zero or includes arbitrary text as a price", () => {
    for (const price of [undefined, "15000 паспорт", Infinity, -1]) expect(invitationPrice("work-contract", { price })).toBe("Стоимость уточняется");
    expect(invitationPrice("work-contract", { price: 0 })).toBe("Стоимость: 0 ₽");
  });
  it("does not use a title containing obvious private requisites in the share text", () => {
    expect(invitationSubject("Ремонт. Телефон +79990000000", "Работы")).toBe("Работы");
  });
});
