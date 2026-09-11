export const passportFieldLabels = {
  lastName: "Фамилия", firstName: "Имя", middleName: "Отчество", birthDate: "Дата рождения",
  birthPlace: "Место рождения", gender: "Пол", series: "Серия паспорта", number: "Номер паспорта",
  issuedAt: "Дата выдачи", issuer: "Кем выдан", divisionCode: "Код подразделения", address: "Адрес регистрации",
} as const;
export type PassportField = keyof typeof passportFieldLabels;
export type PassportData = Record<PassportField, string>;
export type PassportPage = "identity" | "issuance" | "registration";
export const emptyPassport: PassportData = Object.fromEntries(Object.keys(passportFieldLabels).map(key => [key, ""])) as PassportData;

export function passportDate(raw: string): string {
  const match = raw.match(/\b(\d{2})\s*[. /-]\s*(\d{2})\s*[. /-]\s*(\d{4})\b/);
  if (!match) return "";
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) && iso >= "1900-01-01" && date <= new Date() ? iso : "";
}
function normalizedLines(text: string) {
  return text.normalize("NFKC").replace(/\r/g, "").replace(/(ДАТА|МЕСТО|ПАСПОРТ|КОД)\s*\n\s*(РОЖДЕНИЯ|ВЫДАЧИ|ВЫДАН|ПОДРАЗДЕЛЕНИЯ)/gi, "$1 $2").split("\n").map(line => line.replace(/[|]/g, " ").replace(/\s+/g, " ").trim()).filter(line => Boolean(line) && !/^[A-Z0-9<]{20,}$/.test(line));
}
const labelBoundary = /(?:ФАМИЛИЯ|(?:^|\s)ИМЯ(?:\s|$)|ОТЧЕСТВО|ДАТА|МЕСТО|(?:^|\s)(?:РОЖДЕНИЯ|ВЫДАЧИ|ПОДРАЗДЕЛЕНИЯ)(?:\s|$)|ПОЛ(?:\s|$)|КОД ПОДРАЗДЕЛЕНИЯ|ЛИЧНАЯ ПОДПИСЬ|ПОДПИСЬ СОТРУДНИКА|ПАСПОРТ ВЫДАН|СЕРИЯ|НОМЕР)/i;
function afterLabel(lines: string[], pattern: RegExp, maxLines = 1) {
  const index = lines.findIndex(line => pattern.test(line));
  if (index < 0) return "";
  const inline = lines[index]!.replace(pattern, "").replace(/^[:.\s-]+/, "").trim();
  const output = inline ? [inline] : [];
  for (let i = index + 1; i < lines.length && output.length < maxLines; i++) {
    const line = lines[i]!;
    if (labelBoundary.test(line)) break;
    output.push(line);
  }
  return output.join(" ");
}
function person(value: string) {
  const cleaned = value.replace(/^[^А-ЯЁ]+|[^А-ЯЁ -]+$/gi, "").trim();
  if (!/^[А-ЯЁ][А-ЯЁ -]{1,99}$/i.test(cleaned) || labelBoundary.test(cleaned)) return "";
  return cleaned.toLocaleLowerCase("ru").replace(/(^|[ -])([а-яё])/g, (_, space: string, char: string) => space + char.toLocaleUpperCase("ru"));
}
export function parsePassportPages(pages: Partial<Record<PassportPage, string>>) {
  const data = { ...emptyPassport };
  const warnings: string[] = [];
  const identity = normalizedLines(pages.identity ?? "");
  const issuance = normalizedLines(pages.issuance ?? pages.identity ?? "");
  data.lastName = person(afterLabel(identity, /^.*?ФАМИЛИЯ\s*/i));
  data.firstName = person(afterLabel(identity, /^(?:.*\s)?ИМЯ\s*/i));
  data.middleName = person(afterLabel(identity, /^.*?ОТЧЕСТВО\s*/i));
  data.birthDate = passportDate(afterLabel(identity, /^.*?ДАТА\s*РОЖДЕНИЯ\s*/i, 2));
  if (!data.birthDate) data.birthDate = uniqueDate(identity.join(" "));
  data.birthPlace = afterLabel(identity, /^.*?МЕСТО\s*РОЖДЕНИЯ\s*/i, 3).slice(0, 250);
  const sex = identity.join(" ").match(/(?:ПОЛ\s*)?(МУЖ|ЖЕН)\.?/i)?.[1];
  data.gender = sex ? sex.toUpperCase() === "МУЖ" ? "М" : "Ж" : "";
  data.issuedAt = passportDate(afterLabel(issuance, /^.*?ДАТА\s*ВЫДАЧИ\s*/i, 2));
  if (!data.issuedAt && pages.issuance) data.issuedAt = uniqueDate(issuance.join(" "));
  data.issuer = afterLabel(issuance, /^.*?ПАСПОРТ\s*ВЫДАН\s*/i, 4).slice(0, 500);
  data.divisionCode = issuance.join(" ").match(/\b(\d{3})\s*[-–]\s*(\d{3})\b/)?.slice(1).join("-") ?? "";
  const serials = [...(pages.identity ?? "").concat("\n", pages.issuance ?? "").matchAll(/\b(\d{2})\s*(\d{2})\s+(\d{6})\b/g)];
  const unique = new Set(serials.map(match => `${match[1]}${match[2]} ${match[3]}`));
  if (unique.size === 1) [data.series, data.number] = [...unique][0]!.split(" ") as [string, string];
  else if (unique.size > 1) warnings.push("Найдены разные номера паспорта. Укажите нужный вручную.");
  if (pages.registration) {
    const lines = normalizedLines(pages.registration);
    const text = lines.join(" ");
    if ((text.match(/ЗАРЕГИСТРИРОВАН/gi) ?? []).length > 1 || /СНЯТ[А]? С (?:РЕГИСТРАЦИОННОГО )?УЧ[ЕЁ]ТА|ВЫПИСАН|УБЫЛ/i.test(text)) {
      warnings.push("Есть несколько отметок или снятие с учёта. Проверьте актуальный адрес и внесите его вручную.");
    } else {
      const start = lines.findIndex(line => /(?:РЕСП(?:УБЛИКА)?\.?|ОБЛ(?:АСТЬ)?\.?|КРАЙ|ГОР(?:ОД)?\.?|Г\.|СЕЛО|ПОС[ЕЁ]ЛОК|УЛ(?:ИЦА)?\.)\s*[А-ЯЁ]/i.test(line) && !/ОТДЕЛ|УПРАВЛЕНИ|ГУ МВД|УФМС/i.test(line));
      if (start >= 0) {
        const addressLines = [];
        for (const line of lines.slice(start)) {
          if (/НАИМЕНОВАНИЕ ОРГАНА|ОТДЕЛ|УФМС|МВД|ПОДПИСЬ|ЗАВЕРИЛ|КОД ПОДРАЗДЕЛЕНИЯ/i.test(line)) break;
          if (!/МЕСТО ЖИТЕЛЬСТВА|ЗАРЕГИСТРИРОВАН|\b\d{2}\.\d{2}\.\d{4}\b/i.test(line)) addressLines.push(line.replace(/^(?:РЕГ\.?|РЕГИОН|ПУНКТ|УЛИЦА)\s*[:.]\s*/i, ""));
        }
        data.address = addressLines.join(", ").slice(0, 500);
      }
    }
  }
  if (!data.firstName || !data.lastName) warnings.push("ФИО распознано не полностью. Проверьте фотографию и заполните пропуски.");
  if (pages.registration !== undefined && !data.address) warnings.push("Адрес регистрации не удалось определить однозначно. Внесите его вручную; рукописные отметки могут не распознаваться.");
  if (pages.issuance !== undefined && (!data.issuer || !data.issuedAt || !data.divisionCode)) warnings.push("Реквизиты выдачи распознаны не полностью. Проверьте дату, орган выдачи и код подразделения.");
  return { data, warnings };
}

function uniqueDate(text: string) {
  const dates = new Set([...text.matchAll(/\b\d{2}\s*[. /-]\s*\d{2}\s*[. /-]\s*\d{4}\b/g)].map(match => passportDate(match[0])).filter(Boolean));
  return dates.size === 1 ? [...dates][0]! : "";
}
