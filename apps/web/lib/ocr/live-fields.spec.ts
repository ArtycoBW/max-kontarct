import { corroborateFields, detectLiveFields, fieldPixelsChanged, liveCaptureReady } from "./live-fields";
import type { PassportOcrLine } from "./passport-layout";

const clear = { dark: false, glare: false, moving: false, soft: false };
function line(text: string, y: number, confidence = 95): PassportOcrLine {
  const words = text.split(" ").map((text, i) => ({ text, confidence, bbox: { x0: 60 + i * 160, y0: y, x1: 60 + i * 160 + text.length * 12, y1: y + 24 } }));
  return { text, confidence, words, bbox: { x0: 60, y0: y, x1: words.at(-1)!.bbox.x1, y1: y + 24 } };
}
const identity = () => [line("ФАМИЛИЯ ПРИМЕРОВ", 100), line("ИМЯ ИВАН", 160), line("ОТЧЕСТВО ИВАНОВИЧ", 220), line("ДАТА РОЖДЕНИЯ 01.02.1990", 280)];
describe("live field readability (invented text only)", () => {
  it("uses actual word boxes and requires two matching frames for a green signal", () => {
    const first = detectLiveFields("identity", identity(), 1000, 600);
    expect(first.map(field => field.key)).toEqual(["lastName", "firstName", "middleName", "birthDate"]);
    expect(first[0]!.box.x).toBe(.22);
    expect(liveCaptureReady("identity", first, clear)).toBe(false);
    expect(liveCaptureReady("identity", corroborateFields(first, first), clear)).toBe(true);
  });
  it("does not count printed captions as readable personal values", () => {
    expect(detectLiveFields("identity", [line("ФАМИЛИЯ", 100), line("ИМЯ", 160)], 1000, 600)).toEqual([]);
  });
  it("rejects uncertain values even if the parser returns text", () => {
    const rows = identity(); rows[0]!.words[1]!.confidence = 60;
    expect(detectLiveFields("identity", rows, 1000, 600).some(field => field.key === "lastName")).toBe(false);
  });
  it("resets confirmation if value or position changes", () => {
    const first = detectLiveFields("identity", identity(), 1000, 600);
    const changed = identity(); changed[0] = line("ФАМИЛИЯ ДРУГОЙ", 100);
    expect(corroborateFields(first, detectLiveFields("identity", changed, 1000, 600))[0]!.stable).toBe(false);
    const shifted = first.map(field => ({ ...field, box: { ...field.box, y: field.box.y + .1 } }));
    expect(corroborateFields(first, shifted).every(field => !field.stable)).toBe(true);
  });
  it("lighting, blur, motion and missing fields prevent readiness", () => {
    const first = detectLiveFields("identity", identity(), 1000, 600), stable = corroborateFields(first, first);
    for (const key of ["dark", "glare", "moving", "soft"]) expect(liveCaptureReady("identity", stable, { ...clear, [key]: true })).toBe(false);
    expect(liveCaptureReady("identity", stable, null)).toBe(false);
    expect(liveCaptureReady("identity", stable.filter(field => field.key !== "firstName"), clear)).toBe(false);
  });
  it("does not highlight clipped or duplicate personal values", () => {
    const rows = identity(); rows[0]!.words[1]!.bbox.x0 = 0;
    expect(detectLiveFields("identity", rows, 1000, 600).some(field => field.key === "lastName")).toBe(false);
    expect(detectLiveFields("identity", [...identity(), line("ПРИМЕРОВ", 400)], 1000, 600).some(field => field.key === "lastName")).toBe(false);
  });
  it("does not require an optional patronymic", () => {
    const result = detectLiveFields("identity", identity().filter(row => !row.text.startsWith("ОТЧЕСТВО")), 1000, 600);
    expect(liveCaptureReady("identity", corroborateFields(result, result), clear)).toBe(true);
  });
  it("invalidates moving text even on an otherwise stationary blank page", () => {
    const fields = detectLiveFields("identity", identity(), 1000, 600);
    const a = new Uint8Array(1000 * 600).fill(200), b = a.slice();
    expect(fieldPixelsChanged(a, b, 1000, 600, fields)).toBe(false);
    for (let y = 100; y < 124; y++) for (let x = 220; x < 316; x++) b[y * 1000 + x] = 0;
    expect(fieldPixelsChanged(a, b, 1000, 600, fields)).toBe(true);
    expect(fieldPixelsChanged(undefined, b, 1000, 600, fields)).toBe(false);
  });
  it("reads issuance and registration independently; incomplete/cancelled addresses stay unready", () => {
    const issuance = detectLiveFields("issuance", [line("ПАСПОРТ ВЫДАН", 80), line("ОТДЕЛОМ ПРИМЕРНЫМ", 130), line("ДАТА ВЫДАЧИ 02.03.2010", 220), line("КОД ПОДРАЗДЕЛЕНИЯ 000-000", 280)], 1000, 600);
    expect(liveCaptureReady("issuance", corroborateFields(issuance, issuance), clear)).toBe(true);
    const address = [line("ЗАРЕГИСТРИРОВАН", 80), line("Г. ПРИМЕР", 130), line("УЛ. ТЕСТОВАЯ", 200), line("Д. 1", 270)];
    const registration = detectLiveFields("registration", address, 1000, 600);
    expect(liveCaptureReady("registration", corroborateFields(registration, registration), clear)).toBe(true);
    const incomplete = detectLiveFields("registration", address.slice(0, -1), 1000, 600);
    expect(liveCaptureReady("registration", corroborateFields(incomplete, incomplete), clear)).toBe(false);
    expect(detectLiveFields("registration", [...address, line("СНЯТ С УЧЕТА", 350)], 1000, 600)).toEqual([]);
  });
});
