import { mergeRegistrations, readRegistration, readStreetRetry } from "./registration";
import type { PassportOcrLine } from "./passport-layout";

function row(text: string): PassportOcrLine {
  return { text, confidence: 95, bbox: { x0: 0, y0: 0, x1: 500, y1: 25 }, words: text.split(" ").map((text, index) => ({ text, confidence: 95, bbox: { x0: index * 50, y0: 0, x1: index * 50 + 45, y1: 25 } })) };
}
describe("registration components (invented addresses)", () => {
  it("retries a known street row with a lost caption, but never guesses from another row", () => {
    expect(readStreetRetry(row("УЛ. И. ТЕСТОВАЯ"), [row("И . ТЕСТОВАЯ")]).parts.street?.value).toBe("УЛ. И. ТЕСТОВАЯ");
    expect(readStreetRetry(row("ОТДЕЛ МВД УЛ. ТЕСТОВАЯ"), [row("ТЕСТОВАЯ")]).parts).toEqual({});
    expect(readStreetRetry(row("Г. ПРИМЕР"), [row("ТЕСТОВАЯ")]).parts).toEqual({});
    const unclear = row("ТЕСТОВАЯ"); unclear.words[0]!.confidence = 40;
    expect(readStreetRetry(row("УЛ. ТЕСТОВАЯ"), [unclear]).parts).toEqual({});
  });
  it("combines complementary readings without discarding the entire address", () => {
    const a = readRegistration([row("РЕСП. ПРИМЕРНАЯ"), row("Г. ПРИМЕР")]);
    const b = readRegistration([row("УЛ. ТЕСТОВАЯ, Д. 10, КВ. 2А")]);
    expect(mergeRegistrations([a, b])).toEqual({ address: "РЕСП. ПРИМЕРНАЯ, Г. ПРИМЕР, УЛ. ТЕСТОВАЯ, Д. 10, КВ. 2А", uncertain: false, conflict: false });
  });
  it("does not include registration date, authority or signatures", () => {
    const read = readRegistration([row("ЗАРЕГИСТРИРОВАН"), row("22 января 2014 г."), row("Г. ПРИМЕР"), row("Д. 1"), row("ОТДЕЛ МВД ПО Г. ДРУГОМУ")]);
    expect(mergeRegistrations([read]).address).toBe("Г. ПРИМЕР, Д. 1");
  });
  it("retains the house when OCR joins it with the authority on the same line", () => {
    const read = readRegistration([row("Г. ПРИМЕР"), row("Д. 5 КВ. 8 ОТДЕЛ МВД ПО Г. ДРУГОМУ")]);
    expect(mergeRegistrations([read]).address).toBe("Г. ПРИМЕР, Д. 5, КВ. 8");
    expect(readRegistration([row("ОТДЕЛ МВД Д. 5 КВ. 8")]).parts).toEqual({});
  });
  it("does not replace the residential city with an authority continuation", () => {
    const read = readRegistration([row("Г. ПРИМЕР"), row("Д. 1 КВ. 2"), row("ОТДЕЛ ПО ВОПРОСАМ МИГРАЦИИ"), row("Г. ДРУГОЙ")]);
    expect(read.parts.locality?.value).toBe("Г. ПРИМЕР");
  });
  it("uses physical rows when sparse OCR returns the authority before the address", () => {
    const positioned = (text: string, y: number) => { const line = row(text); line.bbox.y0 = y; line.bbox.y1 = y + 25; line.words.forEach(word => { word.bbox.y0 = y; word.bbox.y1 = y + 25; }); return line; };
    const read = readRegistration([positioned("ОТДЕЛ МВД", 200), positioned("Г. ПРИМЕР", 100), positioned("Г. ДРУГОЙ", 240), positioned("Д. 1", 150)]);
    expect(mergeRegistrations([read]).address).toBe("Г. ПРИМЕР, Д. 1");
  });
  it("keeps consistent components and omits conflicting numbers", () => {
    const a = readRegistration([row("Г. ПРИМЕР"), row("Д. 1")]);
    const b = readRegistration([row("Г. ПРИМЕР"), row("Д. 2")]);
    expect(mergeRegistrations([a, b])).toEqual({ address: "Г. ПРИМЕР", uncertain: true, conflict: true });
  });
  it("keeps only an observed corroborated street fragment when initials disagree", () => {
    const make = (value: string, confidence: number) => ({ parts: { street: { value, confidence } }, ambiguous: false });
    const result = mergeRegistrations([make("УЛ. А. ТЕСТОВАЯ", 90), make("УЛ. Б. ПРОВЕРОЧНАЯ", 79), make("УЛ. ПРОВЕРОЧНАЯ", 87)]);
    expect(result).toEqual({ address: "УЛ. ПРОВЕРОЧНАЯ", uncertain: true, conflict: true });
    expect(mergeRegistrations([make("УЛ. ПРИМЕРНАЯ", 90), make("УЛ. ДРУГАЯ", 89)]).address).toBe("");
  });
  it("rejects multiple stamps, deregistration and isolated numbers", () => {
    expect(mergeRegistrations([readRegistration([row("ЗАРЕГИСТРИРОВАН"), row("Г. ПРИМЕР"), row("ЗАРЕГИСТРИРОВАН")])]).address).toBe("");
    expect(mergeRegistrations([readRegistration([row("Г. ПРИМЕР"), row("СНЯТ С УЧЁТА")])]).address).toBe("");
    expect(mergeRegistrations([readRegistration([row("Д. 10, КВ. 2")])]).address).toBe("");
  });
});
