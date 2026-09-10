import { type PassportData, type PassportField, type PassportPage } from "./passport-parser";

export type PassportIssue = { field: PassportField; code: "missing" | "conflict" | "partial" | "uncertain" | "invalid" };
export type PassportReview = { data: PassportData; issues: PassportIssue[]; expected: PassportField[] };
export const reviewGroups: { title: string; fields: PassportField[] }[] = [
  { title: "Личные данные", fields: ["lastName", "firstName", "middleName", "birthDate", "birthPlace", "gender"] },
  { title: "Реквизиты паспорта", fields: ["series", "number", "issuedAt", "issuer", "divisionCode"] },
  { title: "Регистрация", fields: ["address"] },
];
const pageFields: Record<PassportPage, PassportField[]> = {
  identity: [...reviewGroups[0]!.fields, "series", "number"],
  issuance: ["issuer", "issuedAt", "divisionCode", "series", "number"],
  registration: ["address"],
};
export function validReviewValue(field: PassportField, value: string) {
  if (!value.trim()) return false;
  if (field === "series") return /^\d{4}$/.test(value);
  if (field === "number") return /^\d{6}$/.test(value);
  if (field === "divisionCode") return /^\d{3}-\d{3}$/.test(value);
  if (field === "gender") return /^[МЖ]$/i.test(value);
  return true;
}
export function buildPassportReview(data: PassportData, pages: PassportPage[], conflicts: PassportField[], uncertain: PassportField[] = []): PassportReview {
  const included = new Set([...pages.flatMap(page => pageFields[page]), ...(Object.keys(data) as PassportField[]).filter(key => data[key])]);
  const expected = reviewGroups.flatMap(group => group.fields).filter(field => included.has(field));
  const issues: PassportIssue[] = [];
  for (const field of expected) {
    if (conflicts.includes(field)) issues.push({ field, code: "conflict" });
    else if (!data[field] && field !== "middleName") issues.push({ field, code: "missing" });
    else if (data[field] && !validReviewValue(field, data[field])) issues.push({ field, code: "invalid" });
    else if (field === "address" && data.address && !/(?:Д\.?|ДОМ)\s*\d/i.test(data.address)) issues.push({ field, code: "partial" });
    else if (data[field] && uncertain.includes(field)) issues.push({ field, code: "uncertain" });
  }
  return { data, expected, issues };
}
export function activeReviewIssues(data: PassportData, review: Pick<PassportReview, "expected" | "issues">, edited: PassportField[]): PassportIssue[] {
  return review.expected.flatMap(field => {
    if (!data[field].trim()) return field === "middleName" ? [] : [{ field, code: review.issues.find(issue => issue.field === field)?.code === "conflict" && !edited.includes(field) ? "conflict" as const : "missing" as const }];
    if (!validReviewValue(field, data[field])) return [{ field, code: "invalid" as const }];
    return edited.includes(field) ? [] : review.issues.filter(issue => issue.field === field);
  });
}
export function issueDescription(issue: PassportIssue) {
  if (issue.code === "conflict") return "Получились разные варианты. Укажите значение по паспорту.";
  if (issue.code === "partial") return "Прочитан не весь адрес. Дополните его по штампу.";
  if (issue.code === "uncertain") return "Проверьте написание — этот фрагмент читается неуверенно.";
  if (issue.code === "invalid") return issue.field === "series" ? "В серии должно быть 4 цифры." : issue.field === "number" ? "В номере должно быть 6 цифр." : issue.field === "divisionCode" ? "Введите код в формате 000-000." : "Укажите пол: М или Ж.";
  return issue.field === "address" ? "Не удалось прочитать штамп. Введите адрес вручную." : "Не удалось прочитать. Заполните по паспорту.";
}
