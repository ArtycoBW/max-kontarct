import { printedNumber } from "./printed-number";
const row = (text: string, confidence = 95) => ({ text, confidence, bbox: { x0: 0, y0: 0, x1: 400, y1: 30 }, words: text.split(" ").map(text => ({ text, confidence, bbox: { x0: 0, y0: 0, x1: 100, y1: 30 } })) });
it("accepts only a unique complete printed 2+2+6 number", () => {
  expect(printedNumber([row("00 00 123456")])).toEqual({ series: "0000", number: "123456" });
  expect(printedNumber([row("00 00 123456"), row("00 00 123456")])).not.toBeNull();
  expect(printedNumber([row("00 00 123456"), row("00 00 654321")])).toBeNull();
  expect(printedNumber([row("00 00 123456", 59)])).toBeNull();
  expect(printedNumber([row("01.02.1990 123-456")])).toBeNull();
  expect(printedNumber([row("|00 00 123456,")])).toEqual({ series: "0000", number: "123456" });
  expect(printedNumber([row("RUS00 00 123456")])).toBeNull();
  expect(printedNumber([row("00 00"), row("123456")])).toBeNull();
});
