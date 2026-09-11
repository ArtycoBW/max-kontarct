import { documentRedChannel } from "./image-quality";
import type { createLocalOcrWorker } from "./local-worker";
import { normalizePassportText, type PassportOcrLine } from "./passport-layout";
import { readRegistration, readStreetRetry, type RegistrationRead } from "./registration";

export function agreeRegistrationRows(candidates: RegistrationRead[], keys: ("house" | "flat" | "street")[]): RegistrationRead | null {
  if (candidates.length < 2 || candidates.some(read => read.ambiguous)) return null;
  const parts: RegistrationRead["parts"] = {};
  for (const key of keys) {
    const eligible = candidates.flatMap(read => read.parts[key] && read.parts[key]!.confidence >= 80 ? [read.parts[key]!] : []);
    if (eligible.length >= 2 && new Set(eligible.map(part => part.value)).size === 1) parts[key] = { value: eligible[0]!.value, confidence: Math.min(...eligible.map(part => part.confidence)) };
  }
  return Object.keys(parts).length ? { parts, ambiguous: false } : null;
}

/** Isolate a printed house/flat row from the authority immediately underneath.
 * Coordinates come from a recognized caption, not a fixed passport template. */
export function registrationNumberBox(lines: PassportOcrLine[], width: number, height: number) {
  const words = lines.flatMap(line => line.words);
  const anchors = words.filter(word => word.confidence >= 60 && /^КВ\.?$/.test(normalizePassportText(word.text)));
  if (anchors.length !== 1) return null;
  const box = anchors[0]!.bbox, h = box.y1 - box.y0;
  if (h < 8 || !words.some(word => word.confidence >= 60 && /\d/.test(word.text) && word.bbox.x0 > box.x1 && word.bbox.x0 - box.x1 < h * 5 && Math.abs(word.bbox.y0 - box.y0) < h * .5)) return null;
  const left = Math.max(0, box.x0 - h * 8), top = Math.max(0, box.y0 - h * .15);
  return { left, top, width: Math.min(width - left, h * 17), height: Math.min(height - top, h * 1.3) };
}

export async function readRegistrationNumbers(source: HTMLCanvasElement, lines: PassportOcrLine[], worker: Pick<ReturnType<typeof createLocalOcrWorker>, "recognize">, signal: AbortSignal): Promise<RegistrationRead | null> {
  const box = registrationNumberBox(lines, source.width, source.height);
  if (!box) return null;
  const candidates: RegistrationRead[] = [];
  const region = document.createElement("canvas");
  try {
    const context = region.getContext("2d", { willReadFrequently: true })!;
    for (let view = 0; view < 3; view++) {
      signal.throwIfAborted();
      const scale = Math.min(view === 2 ? 1 : 1.5, 1800 / box.width);
      region.width = Math.round(box.width * scale) + 24; region.height = Math.round(box.height * scale) + 24;
      context.fillStyle = "white"; context.fillRect(0, 0, region.width, region.height);
      context.drawImage(source, box.left, box.top, box.width, box.height, 12, 12, region.width - 24, region.height - 24);
      if (view === 1) { const pixels = context.getImageData(0, 0, region.width, region.height); pixels.data.set(documentRedChannel(pixels)); context.putImageData(pixels, 0, 0); }
      const result = await worker.recognize(region, { mode: "7", rotateAuto: false });
      const rows = (result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? []).map(line => ({ ...line, text: normalizePassportText(line.text), words: line.words.map(word => ({ ...word, text: normalizePassportText(word.text) })) }));
      candidates.push(readRegistration(rows));
    }
    // Never infer the house from an unlabelled number or a lone cropped guess.
    return agreeRegistrationRows(candidates, ["house", "flat"]);
  } finally { region.width = region.height = 0; }
}

export async function readRegistrationStreet(source: HTMLCanvasElement, lines: PassportOcrLine[], worker: Pick<ReturnType<typeof createLocalOcrWorker>, "recognize">, signal: AbortSignal): Promise<RegistrationRead | null> {
  const rows = lines.filter(line => /(?:^|\s)УЛ\./i.test(normalizePassportText(line.text)) && !/ОТДЕЛ|МИГРАЦ|МВД/i.test(normalizePassportText(line.text)));
  if (rows.length !== 1) return null;
  const row = rows[0]!, b = row.bbox, h = b.y1 - b.y0;
  const left = Math.max(0, b.x0 - 12), top = Math.max(0, b.y0 - h * .3);
  const width = Math.min(source.width - left, b.x1 - b.x0 + 24), height = Math.min(source.height - top, h * 1.45);
  const candidates: RegistrationRead[] = [];
  for (const factor of [1.5, 2]) {
    signal.throwIfAborted();
    const region = document.createElement("canvas"), scale = Math.min(factor, 2200 / width);
    region.width = Math.round(width * scale) + 24; region.height = Math.round(height * scale) + 24;
    try {
      const context = region.getContext("2d")!;
      context.fillStyle = "white"; context.fillRect(0, 0, region.width, region.height);
      context.drawImage(source, left, top, width, height, 12, 12, region.width - 24, region.height - 24);
      const result = await worker.recognize(region, { mode: "7", rotateAuto: false });
      const lines = (result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? []).map(line => ({ ...line, text: normalizePassportText(line.text), words: line.words.map(word => ({ ...word, text: normalizePassportText(word.text) })) }));
      candidates.push(readStreetRetry({ ...row, text: normalizePassportText(row.text) }, lines));
    } finally { region.width = region.height = 0; }
  }
  return agreeRegistrationRows(candidates, ["street"]);
}
