import { normalizePassportText, readPassportLayout, type PassportOcrLine } from "./passport-layout";
import type { PassportPage } from "./passport-parser";
import type { createLocalOcrWorker } from "./local-worker";

/** Evidence of document text, not generic OCR confidence (wood/patterns can score highly). */
export function orientationScore(page: PassportPage, lines: PassportOcrLine[], text: string) {
  const read = readPassportLayout(page, lines, text);
  const normalized = normalizePassportText(lines.flatMap(line => line.words.filter(word => word.confidence >= 55).map(word => word.text)).join(" ").toUpperCase());
  const labels = page === "identity" ? [/ФАМИЛИЯ/, /ОТЧЕСТВО/, /РОЖДЕНИЯ/, /(?:^|\s)ИМЯ(?:\s|$)/]
    : page === "issuance" ? [/ПАСПОРТ/, /ВЫДАН/, /ПОДРАЗДЕЛЕНИЯ/, /МВД|УФМС/]
      : [/ЗАРЕГИСТРИРОВАН/, /ЖИТЕЛЬСТВА/, /УЛИЦА|УЛ\./, /КВ\./];
  const keys = page === "identity" ? ["lastName", "firstName", "middleName", "birthDate"] as const
    : page === "issuance" ? ["issuer", "issuedAt", "divisionCode"] as const : [];
  const values = keys.filter(key => read.data[key]).length;
  const address = page === "registration" && !read.registration?.ambiguous
    ? (["region", "locality", "street", "house"] as const).filter(key => read.registration?.parts[key]?.value).length : 0;
  return (values + address) * 4 + labels.filter(label => label.test(normalized)).length * 2;
}

export function rotateDocument(source: HTMLCanvasElement, angle: number, limit = 2200) {
  const output = document.createElement("canvas"), scale = Math.min(1, limit / Math.max(source.width, source.height));
  const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
  output.width = angle % 180 ? h : w; output.height = angle % 180 ? w : h;
  const context = output.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Не удалось обработать фотографию.");
  context.translate(output.width / 2, output.height / 2); context.rotate(angle * Math.PI / 180);
  context.drawImage(source, -w / 2, -h / 2, w, h);
  // Callers reuse this canvas for full-frame filters/redraws in ordinary pixel coordinates.
  context.setTransform(1, 0, 0, 1, 0, 0);
  return output;
}

/** LSTM rotateAuto corrects skew, not page orientation. Try right angles explicitly.
 * Probe reads select orientation only: never merge their speculative field values. */
export async function orientDocument(source: HTMLCanvasElement, page: PassportPage, worker: Pick<ReturnType<typeof createLocalOcrWorker>, "recognize">, signal: AbortSignal) {
  const candidates: { angle: number; score: number }[] = [];
  for (const angle of [0, 90, 270, 180]) {
    signal.throwIfAborted();
    const probe = rotateDocument(source, angle, 1400);
    try {
      const result = await worker.recognize(probe, { rotateAuto: false });
      signal.throwIfAborted();
      const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
      const score = orientationScore(page, lines, result.text);
      candidates.push({ angle, score });
      // Multiple page-specific fields/captions suffice; a lone number/code never does.
      if (score >= 16) return rotateDocument(source, angle);
    } finally { probe.width = 0; probe.height = 0; }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const angle = best.score >= 8 && best.score - candidates[1]!.score >= 4 ? best.angle : 0;
  return rotateDocument(source, angle);
}
