import { normalizePassportText, readPassportLayout, type PassportOcrLine } from "./passport-layout";
import { passportDate, type PassportField, type PassportPage } from "./passport-parser";
import type { CaptureQuality } from "./image-quality";

export type LiveFieldKey = PassportField | "region" | "locality" | "street" | "house";
type Definition = { key: LiveFieldKey; label: string; required: boolean };
export type LiveField = Definition & { value: string; box: { x: number; y: number; width: number; height: number }; stable: boolean };
export const liveDefinitions: Record<PassportPage, Definition[]> = {
  identity: [
    { key: "lastName", label: "Фамилия", required: true }, { key: "firstName", label: "Имя", required: true },
    { key: "middleName", label: "Отчество", required: false }, { key: "birthDate", label: "Дата рождения", required: true },
    { key: "birthPlace", label: "Место рождения", required: false },
  ],
  issuance: [{ key: "issuer", label: "Кем выдан", required: true }, { key: "issuedAt", label: "Дата выдачи", required: true }, { key: "divisionCode", label: "Код подразделения", required: true }],
  registration: [{ key: "region", label: "Регион", required: false }, { key: "locality", label: "Населённый пункт", required: true }, { key: "street", label: "Улица", required: true }, { key: "house", label: "Дом", required: true }],
};
const tokens = (text: string): string[] => normalizePassportText(text.toUpperCase()).match(/[А-ЯЁA-Z\d]+/g) ?? [];
const normalized = (text: string) => tokens(text).join(" ");
export const goodCapture = (quality: CaptureQuality | null) => Boolean(quality && !quality.dark && !quality.glare && !quality.soft && !quality.moving);

/** Text can move while most of the blank page stays unchanged. Invalidate old boxes
 * from local pixel changes inside them, not just whole-frame motion statistics. */
export function fieldPixelsChanged(previous: Uint8Array | undefined, current: Uint8Array, width: number, height: number, fields: LiveField[]): boolean {
  if (!previous || previous.length !== current.length) return false;
  return fields.some(field => {
    const left = Math.max(0, Math.floor(field.box.x * width)), right = Math.min(width, Math.ceil((field.box.x + field.box.width) * width));
    const top = Math.max(0, Math.floor(field.box.y * height)), bottom = Math.min(height, Math.ceil((field.box.y + field.box.height) * height));
    let change = 0, count = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { change += Math.abs(previous[y * width + x]! - current[y * width + x]!); count++; }
    return count > 0 && change / count > 14;
  });
}

/** Only boxes of actually recognized values, never hard-coded green template zones.
 * Text exists in memory only for corroboration and is not rendered/logged/persisted. */
export function detectLiveFields(page: PassportPage, input: PassportOcrLine[], width: number, height: number): LiveField[] {
  if (width <= 0 || height <= 0) return [];
  const lines = input.map(line => ({ ...line, text: normalizePassportText(line.text.toUpperCase()), words: line.words.map(word => ({ ...word, text: normalizePassportText(word.text.toUpperCase()) })) }));
  const read = readPassportLayout(page, lines, ""); // No MRZ-only claim of readable printed fields.
  if (read.registration?.ambiguous) return [];
  const words = lines.flatMap(line => line.words);
  return liveDefinitions[page].flatMap(definition => {
    const part = read.registration?.parts[definition.key as keyof NonNullable<typeof read.registration>["parts"]];
    const value = part?.value ?? read.data[definition.key as PassportField];
    if (!value || (part && part.confidence < 78)) return [];
    const wanted = tokens(value);
    const date = definition.key === "birthDate" || definition.key === "issuedAt";
    const matches = words.filter(word => date ? passportDate(word.text) === value : tokens(word.text).length > 0 && tokens(word.text).every(token => wanted.includes(token)));
    // Require coverage of the entire value and reject low-confidence or duplicated name/date readings.
    if (!matches.length || matches.some(word => word.confidence < 78)) return [];
    if (!date && !wanted.every(token => matches.some(word => tokens(word.text).includes(token)))) return [];
    if ((date || ["lastName", "firstName", "middleName"].includes(definition.key)) && matches.length !== 1) return [];
    const left = Math.min(...matches.map(word => word.bbox.x0)), top = Math.min(...matches.map(word => word.bbox.y0));
    const right = Math.max(...matches.map(word => word.bbox.x1)), bottom = Math.max(...matches.map(word => word.bbox.y1));
    if (![left, top, right, bottom].every(Number.isFinite) || left < 0 || top < 0 || right > width || bottom > height || right <= left || bottom <= top) return [];
    // Values clipped at the frame edge are not a green light to take the picture.
    if (left < width * .008 || top < height * .008 || right > width * .992 || bottom > height * .992) return [];
    return [{ ...definition, value, box: { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height }, stable: false }];
  });
}

export function corroborateFields(previous: LiveField[], current: LiveField[]): LiveField[] {
  return current.map(field => ({ ...field, stable: previous.some(old => old.key === field.key && normalized(old.value) === normalized(field.value) &&
    Math.abs(old.box.x - field.box.x) < .035 && Math.abs(old.box.y - field.box.y) < .035 && Math.abs(old.box.width - field.box.width) < .05 && Math.abs(old.box.height - field.box.height) < .035) }));
}
export function liveCaptureReady(page: PassportPage, fields: LiveField[], quality: CaptureQuality | null) {
  return goodCapture(quality) && liveDefinitions[page].filter(field => field.required).every(definition => fields.some(field => field.key === definition.key && field.stable));
}
