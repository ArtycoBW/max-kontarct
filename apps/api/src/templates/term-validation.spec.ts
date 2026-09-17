import { invalidRequiredTermAnswers, missingContractTerms } from "./contract-completeness";

describe("Human payment answers across templates", () => {
  const slugs = ["work-contract", "paid-services", "property-rental", "movable-property-sale"];
  const valid = [
    "в день приёмки, аванса нет", "Без аванса, при передаче", "Предоплата не предусмотрена, после оказания услуги",
    "Аванс не требуется. Оплата по факту выполнения работ", "Без предоплаты, в течение трёх рабочих дней после подписания акта",
    "В день получения результата", "При подписании договора", "До начала работ", "После завершения работ",
    "Предоплата 100%", "Полная предоплата", "Аванс 50% до начала работ, остаток 50% после приёмки",
    "Предоплата 30%, остаток 70% после оказания услуги", "Аванс 5000 рублей, остаток в день приёмки",
    "Аванса нет, переводом до 20.09.2027", "Оплата до 2027-09-20", "Оплата 20 сентября 2027 года",
    "Оплата ежедневно утром за следующие сутки", "Оплата ежемесячно до 5 числа", "Аванс 0%, оплата после приёмки",
    "Аванс отсутствует, по готовности", "Нет предоплаты, по факту сдачи", "После согласования результата",
    "50% предоплата, остаток в день приёмки", "100% предоплата", "Не до приёмки, а после подписания акта",
    "5 000 рублей аванс, остаток после приёмки", "5000 ₽ предоплата, остальная сумма после передачи",
    "Без авансовых платежей, после приёмки", "Не нужен аванс, при передаче", "Аванс не вносим, оплата по факту выполнения работ",
  ];
  for (const slug of slugs) {
    it.each(valid)(`${slug} accepts %s and never repeats the question`, termsPayment => {
      expect(invalidRequiredTermAnswers(slug, {}, { termsPayment })).toEqual([]);
      expect(missingContractTerms(slug, {}, { termsPayment }).map(q => q.id)).not.toContain("termsPayment");
      expect(missingContractTerms(slug, { paymentProcedure: termsPayment }).map(q => q.id)).not.toContain("termsPayment");
    });
  }
  it.each(["", "Предоплата 50%", "Уточним"])("does not replace an explicit correction with an older valid answer: %s", termsPayment => {
    const input = { paymentProcedure: "Оплата после приёмки", sourceDescription: "Оплата при передаче, без аванса" };
    expect(missingContractTerms("paid-services", input, { termsPayment }).map(q => q.id)).toContain("termsPayment");
    expect(invalidRequiredTermAnswers("paid-services", input, { termsPayment })).toHaveLength(1);
  });
  it.each([
    ["нет", "момент"], ["по согласованию", "момент"], ["аванс не нужен", "срок"],
    ["Наличными", "срок"], ["Через 3 дня", "срок"], ["После", "срок"],
    ["Аванс после подписания, остаток при приёмке", "размер"],
    ["Предоплата 50%", "остатка"], ["Аванс 50%, остаток потом", "остатка"],
    ["Аванса нет, аванс 30%, остаток после приёмки", "противоречат"],
    ["Аванс 120%, остаток после приёмки", "доли"], ["Аванс 60%, остаток 60% после приёмки", "доли"],
    ["Оплата частями после приёмки", "платежей"],
    ["Оплата 31.02.2027", "несуществующая дата"], ["Оплата 2027-13-01", "несуществующая дата"],
    ["Не после приёмки", "срок"],
  ])("gives an actionable error for %s", (termsPayment, fragment) => {
    const errors = invalidRequiredTermAnswers("paid-services", {}, { termsPayment });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("termsPayment");
    expect(errors[0]?.message).toContain(fragment);
  });
  it.each(["Без акта", "Акт не подписывается", "Не подпишем акт", "Не подтверждаем приёмку в чате", "Отправлю файл в чат", "Проверим результат за 3 дня"])("does not invent acceptance from %s", termsAcceptance => {
    expect(invalidRequiredTermAnswers("paid-services", {}, { termsAcceptance })).toHaveLength(1);
  });
  it.each([
    ["work-contract", { materialsIncluded: false }, { termsMaterials: "Материалы не нужны" }],
    ["personal-loan", { interestType: "С процентами", interestRate: 5 }, { termsInterest: "Вместе с возвратом займа" }],
    ["personal-loan", {}, { termsLoanTransfer: "По СБП в день подписания" }],
    ["personal-loan", {}, { termsLoanRepayment: "Целиком в указанную дату" }],
    ["property-rental", { depositAmount: 5000 }, { termsDeposit: "Вернём при выезде, если всё цело" }],
  ])("accepts contextual conditional answers for %s", (slug, input, answers) => {
    expect(invalidRequiredTermAnswers(slug, input, answers)).toEqual([]);
    for (const id of Object.keys(answers)) expect(missingContractTerms(slug, input, answers).map(q => q.id)).not.toContain(id);
  });
  it.each(["Без акта, заказчик подтверждает приёмку в чате", "Подпишем акт", "Принимаем результат письменно по почте"])("accepts %s", termsAcceptance => {
    expect(invalidRequiredTermAnswers("paid-services", {}, { termsAcceptance })).toEqual([]);
  });
});
