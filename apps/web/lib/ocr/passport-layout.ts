import { emptyPassport, parsePassportPages, passportDate, type PassportData, type PassportField, type PassportPage } from "./passport-parser";
import { mergeRegistrations, readRegistration, type RegistrationRead } from "./registration";

type Box = { x0: number; y0: number; x1: number; y1: number };
export type PassportOcrLine = { text: string; confidence: number; bbox: Box; words: { text: string; confidence: number; bbox: Box }[] };
export type PassportRead = { data: PassportData; warnings: string[]; mrz: boolean; checkedFields?: PassportField[]; confidence?: Partial<Record<PassportField, number>>; registration?: RegistrationRead; uncertainFields?: PassportField[] };
const lookalikes: Record<string, string> = { A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х" };
export const normalizePassportText = (text: string) => text.normalize("NFKC").replace(/[ABEKMHOPCTYX]/g, char => lookalikes[char]!).replace(/\s+/g, " ").trim();
const name = (text: string) => /^[А-ЯЁ][А-ЯЁ-]{1,39}$/.test(text) ? text.toLocaleLowerCase("ru").replace(/(^|-)([а-яё])/g, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase("ru")) : "";
const label = /ФАМИЛИЯ|ОТЧЕСТВО|(?:^|\s)ИМЯ(?:\s|$)|РОЖДЕНИЯ|ПАСПОРТ|ВЫДАЧИ|ПОДРАЗДЕЛЕНИЯ|ЛИЧНЫЙ|ПОДПИСЬ|МЕСТО|РОССИЙСК|ФЕДЕРАЦ|ЗАРЕГИСТР|НАИМЕНОВАНИЕ|ЗАВЕРИЛ/i;
const addressLabel = /^(?:РЕГ[.:]|РЕСП|ПУНКТ|Г[.:]|УЛ[.:]|УЛИЦА|Д[.:]|КВ[.:])/i;
const centerY = (box: Box) => (box.y0 + box.y1) / 2;

/** Recognize value positions as well as tiny printed captions; no identity lookup/dictionaries. */
export function readPassportLayout(page: PassportPage, input: PassportOcrLine[], rawText: string): PassportRead {
  const lines = input.map(line => ({ ...line, text: normalizePassportText(line.text), words: line.words.map(word => ({ ...word, text: normalizePassportText(word.text) })) }));
  // A low-confidence caption must not discard a high-confidence value on the same line.
  const usable = lines.map(line => line.words.filter(word => word.confidence >= 50 || label.test(word.text) || (page === "registration" && addressLabel.test(word.text))).map(word => word.text).join(" ")).filter(Boolean);
  const parsed = parsePassportPages({ [page]: usable.join("\n") });
  const data = { ...parsed.data };
  const words = lines.flatMap(line => line.words).filter(word => word.confidence >= 55 && word.text.length > 1);
  const dates = words.map(word => ({ ...word, date: passportDate(word.text) })).filter(word => word.date);
  if (page !== "registration") {
    const patronymics = words.filter(word => /[А-ЯЁ]{2,}(?:ВИЧ|ВНА|ИЧНА)$/.test(word.text) && name(word.text));
    // Ambiguous layouts are left to manual review rather than choosing an arbitrary person.
    if (patronymics.length === 1) {
      const patronymic = patronymics[0]!, h = patronymic.bbox.y1 - patronymic.bbox.y0;
      const cx = (patronymic.bbox.x0 + patronymic.bbox.x1) / 2;
      const nearby = words.filter(word => name(word.text) && !label.test(word.text) && word.bbox.y1 < patronymic.bbox.y0 && patronymic.bbox.y0 - word.bbox.y1 < h * 9 && Math.abs((word.bbox.x0 + word.bbox.x1) / 2 - cx) < h * 5).sort((a, b) => b.bbox.y0 - a.bbox.y0);
      data.middleName ||= name(patronymic.text);
      if (nearby[0]) data.firstName ||= name(nearby[0].text);
      if (nearby[1] && nearby[0]!.bbox.y0 - nearby[1].bbox.y1 > h * .3) data.lastName ||= name(nearby[1].text);
      const birth = dates.filter(word => centerY(word.bbox) > patronymic.bbox.y1 && word.bbox.y0 - patronymic.bbox.y1 < h * 4);
      if (birth.length === 1) {
        data.birthDate ||= birth[0]!.date;
        const place = lines.filter(line => line.bbox.y0 > birth[0]!.bbox.y1 && line.bbox.y0 - birth[0]!.bbox.y1 < h * 6).map(line => line.words.filter(word => word.confidence >= 60 && word.bbox.x0 > cx - h * 7 && /^[А-ЯЁ.\s-]+$/.test(word.text) && !label.test(word.text)).map(word => word.text).join(" ")).filter(text => /[А-ЯЁ]{3}/.test(text));
        if (place.length && place.length <= 3) data.birthPlace ||= place.join(" ").slice(0, 250);
      }
    }
    const codes = words.filter(word => /^\d{3}[-–]\d{3}$/.test(word.text));
    if (codes.length === 1) {
      const code = codes[0]!, h = code.bbox.y1 - code.bbox.y0;
      data.divisionCode = code.text.replace("–", "-");
      const issueDates = dates.filter(word => Math.abs(centerY(word.bbox) - centerY(code.bbox)) < h * 3);
      if (issueDates.length === 1) data.issuedAt = issueDates[0]!.date;
      const authority = lines.filter(line => line.bbox.y1 < code.bbox.y0 && code.bbox.y0 - line.bbox.y1 < h * 10);
      const first = authority.findIndex(line => /(?:ГУ|УМВД|МВД|УФМС|ОТДЕЛ|УПРАВЛЕНИ)/.test(line.text));
      if (first >= 0) {
        const issuer = authority.slice(first).filter(line => !dates.some(date => Math.abs(centerY(date.bbox) - centerY(line.bbox)) < h) && !/ВЫДАЧИ|ПОДПИСЬ/.test(line.text)).map(line => line.words.filter(word => word.confidence >= 55 && /^[А-ЯЁ\s.\d-]+$/.test(word.text) && !/ПАСПОРТ|ВЫДАН/.test(word.text)).map(word => word.text).join(" ")).filter(text => /[А-ЯЁ]{3}/.test(text));
        if (issuer.length) data.issuer = issuer.join(" ").slice(0, 500);
      }
    }
  }
  const mrz = page !== "registration" ? readRussianMrz(rawText) : null;
  if (mrz) Object.assign(data, mrz);
  const confidence: Partial<Record<PassportField, number>> = {};
  for (const field of Object.keys(data) as PassportField[]) {
    const parts = data[field].toLocaleUpperCase("ru").split(/\s+/).filter(Boolean);
    const matches = words.filter(word => parts.includes(word.text.toLocaleUpperCase("ru")));
    confidence[field] = mrz?.[field] ? 100 : matches.length ? matches.reduce((sum, word) => sum + word.confidence, 0) / matches.length : 50;
  }
  return { data, warnings: parsed.warnings, mrz: Boolean(mrz), checkedFields: Object.keys(mrz ?? {}) as PassportField[], confidence, ...(page === "registration" ? { registration: readRegistration(lines) } : {}) };
}

/** RF national passport lower MRZ: fixed positions and all numeric checksums, not an authenticity check.
 * Layout: FMS order 279 (2011), table 2; check weights 7,3,1 (ICAO 9303).
 */
export function mrzChecksum(text: string) {
  return String([...text].reduce((sum, char, i) => sum + (char === "<" ? 0 : Number(char)) * [7, 3, 1][i % 3]!, 0) % 10);
}
export function readRussianMrz(text: string): Partial<PassportData> | null {
  const rows = text.toUpperCase().split(/\r?\n/).map(row => row.replace(/\s/g, "").replace(/[«‹]/g, "<"));
  const valid = rows.filter(row => /^\d{10}RUS\d{7}[MF]<{7}\d{13}<\d{2}$/.test(row) && row.length === 44 &&
    mrzChecksum(row.slice(0, 9)) === row[9] && mrzChecksum(row.slice(13, 19)) === row[19] &&
    mrzChecksum(row.slice(28, 42)) === row[42] && mrzChecksum(row.slice(0, 10) + row.slice(13, 20) + row.slice(21, 43)) === row[43]);
  if (new Set(valid).size !== 1) return null;
  const row = valid[0]!;
  const date = (short: string, issuance = false) => {
    const candidates = ["19", "20"].map(century => passportDate(`${short.slice(4, 6)}.${short.slice(2, 4)}.${century}${short.slice(0, 2)}`)).filter(value => value && (!issuance || value >= "1997-01-01"));
    const printed = [...text.matchAll(/\d{2}\s*[. /-]\s*\d{2}\s*[. /-]\s*\d{4}/g)].map(match => passportDate(match[0]));
    const corroborated = candidates.filter(value => printed.includes(value));
    return corroborated.length === 1 ? corroborated[0]! : candidates.length === 1 ? candidates[0]! : "";
  };
  const birthDate = date(row.slice(13, 19)), issuedAt = date(row.slice(29, 35), true);
  if (!issuedAt || (birthDate && issuedAt < birthDate)) return null;
  return { series: row.slice(0, 3) + row[28], number: row.slice(3, 9), ...(birthDate ? { birthDate } : {}), issuedAt, gender: row[20] === "M" ? "М" : "Ж", divisionCode: row.slice(35, 38) + "-" + row.slice(38, 41) };
}

export function mergePassportReads(reads: PassportRead[]) {
  const data = { ...emptyPassport }, conflicts: PassportField[] = [], uncertain: PassportField[] = [];
  for (const key of Object.keys(data) as PassportField[]) {
    const checked = reads.filter(read => read.checkedFields?.includes(key) && read.data[key]);
    const candidates = (checked.length ? checked : reads).map(read => read.data[key]).filter(Boolean);
    const unique = new Map(candidates.map(value => [value.toLocaleUpperCase("ru").replace(/[\s,.]+/g, ""), value]));
    if (unique.size === 1) data[key] = [...unique.values()][0]!;
    else if (unique.size > 1) {
      const ranked = (checked.length ? checked : reads).filter(read => read.data[key]).sort((a, b) => (b.confidence?.[key] ?? 50) - (a.confidence?.[key] ?? 50));
      const best = ranked[0]!, score = best.confidence?.[key] ?? 50;
      const competitor = ranked.find(read => read.data[key].toLocaleUpperCase("ru") !== best.data[key].toLocaleUpperCase("ru"));
      const normalized = (value: string) => value.toLocaleUpperCase("ru").replace(/[\s,.]+/g, "");
      const extendsPartial = ["birthPlace", "address", "issuer"].includes(key) && candidates.every(value => normalized(best.data[key]).includes(normalized(value)));
      if (score >= 85 && (extendsPartial || score - (competitor?.confidence?.[key] ?? 50) >= 15)) data[key] = best.data[key];
      else conflicts.push(key);
    }
  }
  const registrations = reads.flatMap(read => read.registration ? [read.registration] : []);
  if (registrations.some(read => read.ambiguous || Object.keys(read.parts).length)) {
    const result = mergeRegistrations(registrations);
    data.address = result.address;
    const index = conflicts.indexOf("address"); if (index >= 0) conflicts.splice(index, 1);
    if (!result.address && result.conflict) conflicts.push("address");
    else if (result.uncertain && result.address) uncertain.push("address");
  }
  for (const read of reads) for (const field of read.uncertainFields ?? []) if (data[field] && !uncertain.includes(field)) uncertain.push(field);
  return { data, conflicts, uncertain };
}
