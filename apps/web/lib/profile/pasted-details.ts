import { passportDate, type PassportData, type PassportField } from "../ocr/passport-parser";

type ImportField = PassportField | "fullName" | "passportNumber";
const labels: Record<string, ImportField> = {
  "фамилия": "lastName", "имя": "firstName", "отчество": "middleName",
  "фио": "fullName", "ф.и.о.": "fullName", "фамилия, имя, отчество": "fullName", "фамилия имя отчество": "fullName",
  "дата рождения": "birthDate", "место рождения": "birthPlace", "пол": "gender",
  "серия": "series", "серия паспорта": "series", "номер": "number", "номер паспорта": "number",
  "серия и номер": "passportNumber", "серия и номер паспорта": "passportNumber", "серия, номер": "passportNumber",
  "дата выдачи": "issuedAt", "кем выдан": "issuer", "паспорт выдан": "issuer",
  "код подразделения": "divisionCode", "адрес регистрации": "address", "место жительства": "address",
  "адрес места жительства": "address", "адрес постоянной регистрации": "address",
};
const patterns = Object.entries(labels).sort(([a], [b]) => b.length - a.length).map(([label, field]) => ({
  field,
  pattern: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[ \\t]+")}(?:[ \\t]*[:：][ \\t]*|[ \\t]+|$)(.*)$`, "iu"),
}));
const namePattern = /^[\p{L}][\p{L}\p{M}'’-]{0,99}$/u;

function normalize(field: PassportField, value: string): string | undefined {
  if (!value) return;
  if (field === "birthDate" || field === "issuedAt") {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
    if (iso) return passportDate(`${iso[3]}.${iso[2]}.${iso[1]}`) || undefined;
    if (/^\d{2}[./-]\d{2}[./-]\d{4}$/u.test(value)) return passportDate(value) || undefined;
    return;
  }
  if (field === "series" || field === "number") {
    const digits = value.replace(/\s/g, "");
    return new RegExp(`^\\d{${field === "series" ? 4 : 6}}$`).test(digits) ? digits : undefined;
  }
  if (field === "divisionCode") {
    const digits = value.replace(/[\s\-–—]/g, "");
    return /^\d{6}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3)}` : undefined;
  }
  if (field === "gender") {
    if (/^(?:м|муж\.?|мужской)$/iu.test(value)) return "М";
    if (/^(?:ж|жен\.?|женский)$/iu.test(value)) return "Ж";
    return;
  }
  if (["lastName", "firstName", "middleName"].includes(field)) {
    return value.length <= 100 && value.split(" ").every(word => namePattern.test(word)) ? value : undefined;
  }
  return value.length <= (field === "birthPlace" ? 250 : 500) ? value : undefined;
}

/** Local text import only. No clipboard access, network, persistence or identity verification. */
export function inspectPastedDetails(text: string) {
  const data: Partial<PassportData> = {};
  const review = new Set<PassportField>();
  const assign = (field: PassportField, raw: string) => {
    const value = normalize(field, raw.trim());
    if (!value || review.has(field) || (data[field] !== undefined && data[field] !== value)) {
      delete data[field];
      review.add(field);
    } else data[field] = value;
  };
  let current: ImportField | undefined;
  let values: string[] = [];
  const flush = () => {
    if (!current || !values.length) return;
    const value = values.join(" ").replace(/\s+/g, " ").trim();
    if (current === "fullName") {
      const parts = value.split(" ");
      if (parts.length >= 2 && parts.length <= 3 && parts.every(part => namePattern.test(part))) {
        assign("lastName", parts[0]!); assign("firstName", parts[1]!);
        if (parts[2]) assign("middleName", parts[2]);
      } else {
        for (const field of ["lastName", "firstName", "middleName"] as const) { delete data[field]; review.add(field); }
      }
    } else if (current === "passportNumber") {
      const digits = value.replace(/\s/g, "");
      if (/^\d{10}$/.test(digits)) { assign("series", digits.slice(0, 4)); assign("number", digits.slice(4)); }
      else { assign("series", ""); assign("number", ""); }
    } else assign(current, value);
  };
  const lines = text.slice(0, 5000).replace(/\u00a0/g, " ").replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").split(/\r\n?|\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const found = patterns.map(({ field, pattern }) => ({ field, match: line.match(pattern) })).find(item => item.match);
    if (found) {
      flush(); current = found.field;
      const value = found.match![1]!.replace(/^[–—]\s*/u, "").trim();
      values = value ? [value] : [];
    } else if (/[:：]|^(?:госуслуги|цифровой id|паспорт(?: рф| гражданина.*)?|скопировать данные|предъявить)$|^(?:снилс|инн|гражданство|дата регистрации)(?:\s|$)/iu.test(line)) {
      flush(); current = undefined; values = [];
    } else if (current && (!values.length || ["address", "issuer", "birthPlace", "fullName", "passportNumber"].includes(current))) {
      values.push(line);
    }
  }
  flush();
  return { data, reviewFields: [...review] };
}

export function parsePastedDetails(text: string): Partial<PassportData> {
  return inspectPastedDetails(text).data;
}
