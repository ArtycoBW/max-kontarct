import type { PassportOcrLine } from "./passport-layout";

const partOrder = ["region", "district", "locality", "street", "house", "flat"] as const;
type AddressPart = typeof partOrder[number];
type Candidate = { value: string; confidence: number };
export type RegistrationRead = { parts: Partial<Record<AddressPart, Candidate>>; ambiguous: boolean };
const normalized = (text: string) => text.toLocaleUpperCase("ru").replace(/[\s,.:]+/g, "");
const authority = /ОТДЕЛ|МИГРАЦ|УФМС|МВД|ПОДПИСЬ|ЗАВЕРИЛ|НАИМЕНОВАНИЕ/i;
const endPart = /\s*,?\s+(?:Д(?:ОМ)?|КВ(?:АРТИРА)?|КОРП|СТР)[.:]?\s*\d/i;

/** Extract components separately: a missed house number must not discard the readable city. */
export function readRegistration(lines: PassportOcrLine[]): RegistrationRead {
  const text = lines.map(line => line.text).join("\n");
  const ambiguous = (text.match(/ЗАРЕГИСТРИРОВАН/gi) ?? []).length > 1 || /СНЯТ[А]? С (?:РЕГИСТРАЦИОННОГО )?УЧ[ЕЁ]ТА|ВЫПИСАН|УБЫЛ/i.test(text);
  const parts: RegistrationRead["parts"] = {};
  if (ambiguous) return { parts, ambiguous };
  for (const line of lines) {
    const authorityIndex = line.words.findIndex(word => authority.test(word.text));
    const addressWords = authorityIndex < 0 ? line.words : line.words.slice(0, authorityIndex);
    const row = addressWords.filter(word => word.confidence >= 25 || /^(?:Д|КВ|УЛ|Г|РЕСП)[.,:]?$/.test(word.text)).map(word => word.text).join(" ");
    const add = (part: AddressPart, raw: string | undefined) => {
      const value = raw?.trim().replace(/^[,\s]+|[,\s]+$/g, "").replace(/\s+/g, " ");
      if (!value || value.length > 180) return;
      const tokens: string[] = Array.from(value.toUpperCase().match(/[А-ЯЁ\d-]+/g) ?? []);
      const matched = line.words.filter(word => tokens.includes(word.text.replace(/[.,:]/g, "").toUpperCase()) && !/^(?:Д|КВ|УЛ|Г|РЕСП|ПУНКТ|РЕГ)[.:]?$/.test(word.text));
      const confidence = matched.length ? matched.reduce((sum, word) => sum + word.confidence, 0) / matched.length : line.confidence;
      if (confidence < 45) return;
      if (!parts[part] || confidence > parts[part]!.confidence) parts[part] = { value, confidence };
    };
    const region = row.match(/(?:РЕСП(?:УБЛИКА)?\.?\s+[А-ЯЁ][А-ЯЁ .-]+|[А-ЯЁ][А-ЯЁ -]+\s+(?:ОБЛ(?:АСТЬ)?\.?|КРАЙ))/i)?.[0];
    add("region", region?.split(endPart)[0]);
    add("district", row.match(/(?:[А-ЯЁ][А-ЯЁ -]+\s+Р-Н|Р-Н\s*[:.]\s*[А-ЯЁ][А-ЯЁ -]+)/i)?.[0]);
    add("locality", row.match(/(?:^|\s)((?:Г\.|ГОРОД|С\.|СЕЛО|ПОС\.|ПОС[ЕЁ]ЛОК|ДЕР\.|ДЕРЕВНЯ)\s*[А-ЯЁ][А-ЯЁ .-]+)/i)?.[1]?.split(endPart)[0]);
    add("street", row.match(/(?:^|\s)((?:УЛ\.|УЛИЦА|ПР-КТ|ПРОСПЕКТ|ПЕР\.|ПЕРЕУЛОК|ШОССЕ|НАБ\.)\s*[А-ЯЁ\d][А-ЯЁ\d ."-]+)/i)?.[1]?.replace(/^УЛИЦА\s*[:.]?\s*УЛ\./i, "УЛ.")?.split(endPart)[0]);
    const house = row.match(/(?:^|[\s,])Д(?:ОМ)?[.,:]?\s*(\d+[А-ЯЁ]?(?:[/-]\d+[А-ЯЁ]?)?)/i)?.[1];
    add("house", house ? `Д. ${house}` : undefined);
    const flat = row.match(/(?:^|[\s,])КВ(?:АРТИРА)?[.,:]?\s*(\d+\s*[А-ЯЁ]?)(?:[\s,.]|$)/i)?.[1];
    add("flat", flat ? `КВ. ${flat.replace(/\s/g, "")}` : undefined);
  }
  return { parts, ambiguous };
}

/** A line crop may lose the tiny printed caption. Reuse only a caption observed in
 * that exact source row; never infer a street from an unrelated name or authority. */
export function readStreetRetry(source: PassportOcrLine, lines: PassportOcrLine[]): RegistrationRead {
  const empty: RegistrationRead = { parts: {}, ambiguous: false };
  if (authority.test(source.text) || !/(?:^|\s)УЛ\./i.test(source.text) || lines.length !== 1) return empty;
  const words = lines[0]!.words;
  const selected = words.filter((word, index) => word.confidence >= 65 && (
    /^[А-ЯЁ][А-ЯЁ-]{1,39}[.,]?$/.test(word.text) || /^[А-ЯЁ]\.$/.test(word.text) ||
    (/^[А-ЯЁ]$/.test(word.text) && words[index + 1]?.text === ".") ||
    (word.text === "." && /^[А-ЯЁ]$/.test(words[index - 1]?.text ?? ""))
  ) && !/^(?:УЛИЦА|УЛ\.)$/.test(word.text));
  if (!selected.some(word => /^[А-ЯЁ-]{3,}[.,]?$/.test(word.text))) return empty;
  const confidence = selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length;
  if (confidence < 80) return empty;
  const value = "УЛ. " + selected.map(word => word.text).join(" ").replace(/([А-ЯЁ])\s+\./g, "$1.").replace(/[,\s]+$/g, "");
  return { parts: { street: { value, confidence } }, ambiguous: false };
}

export function mergeRegistrations(reads: RegistrationRead[]) {
  if (reads.some(read => read.ambiguous)) return { address: "", uncertain: false, conflict: true };
  const selected: Partial<Record<AddressPart, string>> = {};
  let uncertain = false, conflict = false;
  for (const part of partOrder) {
    const candidates = reads.flatMap(read => read.parts[part] ? [read.parts[part]!] : []);
    const groups = new Map<string, { value: string; confidence: number; count: number }>();
    for (const candidate of candidates) {
      const key = normalized(candidate.value), old = groups.get(key);
      groups.set(key, { value: candidate.value, confidence: Math.max(old?.confidence ?? 0, candidate.confidence), count: (old?.count ?? 0) + 1 });
    }
    const ranked = [...groups.values()].sort((a, b) => (b.confidence + Math.min(b.count - 1, 2) * 5) - (a.confidence + Math.min(a.count - 1, 2) * 5));
    const best = ranked[0], next = ranked[1];
    if (!best) continue;
    const extension = [...groups.values()].every(candidate => normalized(best.value).includes(normalized(candidate.value)));
    if (best.confidence >= 60 && (!next || extension || (best.count >= 2 && next.count === 1 && best.confidence >= 80) || best.confidence - next.confidence >= 15)) {
      selected[part] = best.value; if (best.confidence < 85 || (next && !extension)) uncertain = true;
    } else {
      // Preserve a directly observed shorter street name corroborated by another
      // read, without inventing a disputed initial or replacing similar letters.
      const suffix = (value: string) => value.toUpperCase().replace(/^УЛ\.\s*/, "").replace(/[.,]/g, "").trim();
      const partial = part === "street" ? ranked.find(candidate => candidate.confidence >= 80 && /^[А-ЯЁ -]{3,}$/.test(suffix(candidate.value)) &&
        ranked.some(other => other !== candidate && other.confidence >= 70 && suffix(other.value).endsWith(" " + suffix(candidate.value)))) : undefined;
      if (partial) selected[part] = partial.value;
      uncertain = true; conflict = true;
    }
  }
  // Never present isolated numbers as an address.
  const address = selected.locality || selected.street || selected.region ? partOrder.flatMap(part => selected[part] ? [selected[part]] : []).join(", ") : "";
  return { address, uncertain: uncertain || !selected.locality || !selected.house, conflict };
}
