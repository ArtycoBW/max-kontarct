import type { PassportData, PassportField } from "@/lib/ocr/passport-parser";

const labels: Record<string, PassportField> = {
  "фамилия": "lastName", "имя": "firstName", "отчество": "middleName", "дата рождения": "birthDate",
  "место рождения": "birthPlace", "пол": "gender", "серия": "series", "серия паспорта": "series", "номер": "number",
  "номер паспорта": "number", "дата выдачи": "issuedAt", "кем выдан": "issuer", "паспорт выдан": "issuer",
  "код подразделения": "divisionCode", "адрес регистрации": "address", "место жительства": "address",
};

/** Local, labelled-text import. It neither authenticates MAX data nor reads the clipboard. */
export function parsePastedDetails(text: string): Partial<PassportData> {
  const result: Partial<PassportData> = {};
  const seen = new Set<PassportField>();
  for (const line of text.slice(0, 5000).split(/\r?\n/u)) {
    const match = line.match(/^\s*([^:]+):\s*(.+?)\s*$/u);
    if (!match) continue;
    const key = labels[match[1]!.trim().toLocaleLowerCase("ru-RU")];
    if (!key) continue;
    const value = match[2]!.trim();
    // Conflicting duplicate labels are ambiguous; leave that field for manual entry.
    if (seen.has(key)) { if (result[key] !== value) delete result[key]; continue; }
    seen.add(key);
    result[key] = value;
  }
  for (const key of ["birthDate", "issuedAt"] as const) {
    const value = result[key];
    if (!value) continue;
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
    const normalized = match ? `${match[3]}-${match[2]}-${match[1]}` : value;
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === normalized) result[key] = normalized;
    else delete result[key];
  }
  return result;
}
