import type { PassportOcrLine } from "./passport-layout";

/** A printed serial must be observed as 2 + 2 + 6 digits on one text row.
 * Do not infer numbers from dates, MRZ fragments or scattered page digits. */
export function printedNumber(lines: PassportOcrLine[]) {
  const candidates = lines.flatMap(line => {
    const text = line.words.filter(word => word.confidence >= 60).map(word => word.text.replace(/^[|,.:;]+|[|,.:;]+$/g, "")).join(" ");
    const matches = [...text.matchAll(/(?:^|\s)(\d{2})\s+(\d{2})\s+(\d{6})(?=\s|$)/g)];
    return matches.map(match => ({ series: match[1]! + match[2]!, number: match[3]! }));
  });
  const unique = new Map(candidates.map(value => [value.series + value.number, value]));
  return unique.size === 1 ? [...unique.values()][0]! : null;
}
