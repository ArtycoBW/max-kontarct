import { agreeRegistrationRows, registrationNumberBox, readRegistrationNumbers } from "./registration-retry";
import type { PassportOcrLine } from "./passport-layout";

const word = (text: string, x: number, confidence = 95) => ({ text, confidence, bbox: { x0: x, x1: x + 30, y0: 200, y1: 220 } });
const row = (words: ReturnType<typeof word>[]): PassportOcrLine => ({ text: words.map(word => word.text).join(" "), confidence: 95, bbox: { x0: 10, x1: 300, y0: 200, y1: 220 }, words });

it("locates the observed flat row, with image-bounded margins", () => {
  const box = registrationNumberBox([row([word("КВ.", 100), word("2А", 150)])], 400, 300)!;
  expect(box.left).toBe(0); expect(box.top).toBe(197); expect(box.height).toBe(26);
  expect(box.left + box.width).toBeLessThanOrEqual(400);
});
it("does not infer a numeric row without an unambiguous readable caption and value", async () => {
  for (const words of [[word("2", 150)], [word("КВ.", 100, 40), word("2", 150)], [word("КВ.", 100)], [word("КВ.", 100), word("КВ.", 200), word("2", 250)]]) expect(registrationNumberBox([row(words)], 400, 300)).toBeNull();
  const recognize = jest.fn();
  expect(await readRegistrationNumbers({ width: 400, height: 300 } as HTMLCanvasElement, [], { recognize }, new AbortController().signal)).toBeNull();
  expect(recognize).not.toHaveBeenCalled();
});
it("requires two confident matching reads, without manufacturing missing address parts", () => {
  const read = (value: string, confidence = 90) => ({ parts: { house: { value, confidence } }, ambiguous: false });
  expect(agreeRegistrationRows([read("Д. 1"), read("Д. 1", 85)], ["house", "flat"])).toEqual(read("Д. 1", 85));
  expect(agreeRegistrationRows([read("Д. 1"), read("Д. 2")], ["house"])).toBeNull();
  expect(agreeRegistrationRows([read("Д. 1")], ["house"])).toBeNull();
  expect(agreeRegistrationRows([read("Д. 1"), read("Д. 1", 79)], ["house"])).toBeNull();
  expect(agreeRegistrationRows([read("Д. 2", 77), read("Д. 1", 86), read("Д. 1", 85)], ["house"])).toEqual(read("Д. 1", 85));
  expect(agreeRegistrationRows([read("Д. 2", 90), read("Д. 1", 86), read("Д. 1", 85)], ["house"])).toBeNull();
  expect(agreeRegistrationRows([read("Д. 1"), { ...read("Д. 1"), ambiguous: true }], ["house"])).toBeNull();
});
