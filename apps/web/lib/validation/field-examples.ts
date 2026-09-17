const examples: Record<string, string> = {
  termsPayment: "В день приёмки, аванса нет",
  termsAcceptance: "Заказчик проверяет результат и подтверждает приёмку сообщением в чате",
  termsMaterials: "Материалы покупает заказчик за свой счёт",
  termsUtilities: "Арендатор оплачивает коммунальные расходы по счетам",
  termsDeposit: "В течение 3 дней после возврата имущества, без удержаний при отсутствии ущерба",
  termsLoanTransfer: "Переводом в день подписания договора",
  termsLoanRepayment: "Одним платежом в указанную дату возврата",
  termsInterest: "Вместе с возвратом займа",
  termsPaymentMethod: "Через СБП",
  workLocation: "г. Казань, ул. Примерная, д. 10, кв. 2",
  serviceLocation: "Онлайн, результат передаётся по электронной почте",
  transferLocation: "г. Казань, ул. Примерная, д. 10",
  propertyAddress: "г. Казань, ул. Примерная, д. 10, кв. 2",
  termsLocation: "г. Казань, ул. Примерная, д. 10",
  termsProperty: "г. Казань, ул. Примерная, д. 10; либо модель и серийный номер вещи",
};

export function fieldExample(key: string): string | undefined { return examples[key]; }

/** Copy a clearly labelled address into an empty questionnaire field for review; never overwrite edits. */
export function prefillDescriptionLocation(description: string, answers: Record<string, unknown>, fieldKeys: string[]) {
  const key = ["workLocation", "serviceLocation", "transferLocation", "propertyAddress"].find(item => fieldKeys.includes(item));
  if (!key || (answers[key] !== undefined && answers[key] !== null && answers[key] !== "")) return answers;
  const matches = [...description.matchAll(/(?:г\.|город)\s*[А-Яа-яЁё-]+\s*,?\s*(?:ул\.|улица|проспект|пр-т|шоссе|пер\.|переулок)\s+[А-Яа-яЁё\d .-]+?\s*,?\s*(?:д\.|дом)\s*\d+[А-Яа-яЁё]?(?:[/-]\d+)?(?:\s*,?\s*(?:кв\.|квартира|офис|корп\.|корпус|стр\.)\s*\d+[А-Яа-яЁё]?){0,3}/gu)];
  // Ambiguous descriptions with several places stay untouched.
  if (matches.length !== 1 || /(?:прежде|старый адрес|вместо|не по адресу|паспорт|регистраци|проживани)/iu.test(description)) return answers;
  return { ...answers, [key]: matches[0]![0].trim() };
}
