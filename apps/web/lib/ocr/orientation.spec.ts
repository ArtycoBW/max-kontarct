import { orientationScore, rotateDocument } from "./orientation";
import type { PassportOcrLine } from "./passport-layout";

const lines = (rows: string[], confidence = 95): PassportOcrLine[] => rows.map((text, i) => ({ text, confidence, bbox: { x0: 0, x1: 400, y0: i * 40, y1: i * 40 + 20 }, words: text.split(" ").map((text, j) => ({ text, confidence, bbox: { x0: j * 100, x1: j * 100 + 90, y0: i * 40, y1: i * 40 + 20 } })) }));
describe("right-angle document orientation", () => {
  it("resets the drawing transform before subsequent full-frame filters", () => {
    const previous = globalThis.document;
    const context = { translate: jest.fn(), rotate: jest.fn(), drawImage: jest.fn(), setTransform: jest.fn() };
    const output = { width: 0, height: 0, getContext: () => context };
    globalThis.document = { createElement: () => output } as unknown as Document;
    try {
      rotateDocument({ width: 1200, height: 800 } as HTMLCanvasElement, 90);
      expect(output.width).toBe(800); expect(output.height).toBe(1200);
      expect(context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);
      expect(context.setTransform.mock.invocationCallOrder[0]).toBeGreaterThan(context.drawImage.mock.invocationCallOrder[0]!);
    } finally { globalThis.document = previous; }
  });
  it("does not accept a lone vertical number or division code as upright text", () => {
    expect(orientationScore("identity", lines(["12 34 567890"]), "12 34 567890")).toBe(0);
    expect(orientationScore("issuance", lines(["123-456"]), "123-456")).toBeLessThan(8);
  });
  it("uses several page-specific fields and captions", () => {
    expect(orientationScore("identity", lines(["ФАМИЛИЯ ПРИМЕРОВ", "ИМЯ ИВАН", "ОТЧЕСТВО ИВАНОВИЧ", "ДАТА РОЖДЕНИЯ 01.02.1990"]), "")).toBeGreaterThanOrEqual(16);
    expect(orientationScore("issuance", lines(["ПАСПОРТ ВЫДАН МВД РОССИИ", "ДАТА ВЫДАЧИ 01.02.2020", "КОД ПОДРАЗДЕЛЕНИЯ 123-456"]), "")).toBeGreaterThanOrEqual(16);
    expect(orientationScore("registration", lines(["ЗАРЕГИСТРИРОВАН", "Г. ПРИМЕРСК", "УЛ. ТЕСТОВАЯ", "Д. 5 КВ. 8"]), "")).toBeGreaterThanOrEqual(8);
  });
  it("does not give confidence to low-confidence text/patterns", () => {
    expect(orientationScore("identity", lines(["АБВГДЕЁЖЗ", "ЦУКЕНГШЩЗХФЫВА"], 10), "")).toBe(0);
  });
});
