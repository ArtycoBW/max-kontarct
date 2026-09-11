import type { PassportOcrLine } from "./passport-layout";

/** A printed serial must be observed as ten digits on one complete text row.
 * Do not infer numbers from dates, MRZ fragments or scattered page digits. */
export function printedNumber(lines: PassportOcrLine[]) {
  const candidates = lines.flatMap(line => {
    if (!line.words.length || line.words.some(word => word.confidence < 60)) return [];
    const text = line.words.map(word => word.text.replace(/^[|,;]+|[|,;]+$/g, "")).join(" ").trim();
    if (!/^(?:\d\s*){10}$/.test(text)) return [];
    const digits = text.replace(/\s/g, "");
    return [{ series: digits.slice(0, 4), number: digits.slice(4) }];
  });
  const unique = new Map(candidates.map(value => [value.series + value.number, value]));
  return unique.size === 1 ? [...unique.values()][0]! : null;
}
