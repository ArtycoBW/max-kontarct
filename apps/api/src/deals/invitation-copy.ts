/** Public invitation text never reads the profile's contact, passport or address fields. */
const PRIVATE_TEXT = /(?:паспорт|снилс|\bинн\b|регистраци|проживани|реквизит|телефон|электронн.{0,8}почт|@|\+\d|\d[\d\s()-]{8,}\d|https?:\/\/)/iu;

export function invitationSubject(title: string, templateTitle: string): string {
  const clean = title.replace(/[\r\n\t]+/g, " ").trim();
  return !clean || PRIVATE_TEXT.test(clean) ? templateTitle : clean.slice(0, 180);
}

export function invitationPrice(slug: string, answers: Record<string, unknown>): string {
  const key = ({
    "movable-property-sale": "price", "work-contract": "price", "personal-loan": "loanAmount",
    "paid-services": "paymentAmount", "property-rental": "paymentAmount", "individual-agreement": "paymentAmount",
  } as Record<string, string>)[slug];
  const value = key ? answers[key] : undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Стоимость уточняется";
  const amount = `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ₽`;
  return slug === "personal-loan" ? `Сумма займа: ${amount}` : `Стоимость: ${amount}`;
}

export function invitationMessage(input: { firstName: string; title: string; templateTitle: string; description?: string; slug: string; answers: Record<string, unknown> }): string {
  const subjectKey = ({ "paid-services": "serviceDescription", "work-contract": "workDescription", "movable-property-sale": "propertyDescription", "property-rental": "propertyDescription", "personal-loan": "purpose" } as Record<string, string>)[input.slug];
  const detail = subjectKey ? input.answers[subjectKey] : undefined;
  const subject = typeof detail === "string" && detail.trim() && !PRIVATE_TEXT.test(detail)
    ? detail : input.title.trim().toLocaleLowerCase("ru") === input.templateTitle.trim().toLocaleLowerCase("ru") && input.description && !PRIVATE_TEXT.test(input.description) ? input.description : input.title;
  const dates = [["startDate", "Начало"], ["endDate", "Окончание"], ["completionDate", "Срок"], ["transferDate", "Передача"], ["returnDate", "Возврат"]].flatMap(([key, label]) => {
    const value = input.answers[key!];
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? [`${label}: ${value.split("-").reverse().join(".")}`] : [];
  });
  return [
    `${input.firstName.replace(/[\r\n]+/g, " ").trim() || "Участник"} приглашает вас в сделку «Макс-Контракт».`,
    `Предмет: ${invitationSubject(subject, input.templateTitle)}`,
    invitationPrice(input.slug, input.answers),
    ...dates,
    "Описание и основные условия — по защищённой ссылке. Не пересылайте приглашение посторонним.",
    "Переход по ссылке не означает согласие с условиями или подписание договора.",
  ].join("\n\n");
}
