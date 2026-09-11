import { serialContrast, isolatedSerial, serialRegions } from "./serial-region";

it("accepts complete isolated serials but never repairs or guesses a digit", () => {
  for (const text of ["00 00 123456", "0000 123456", "0000123456", "00 0 0 12 3456"]) expect(isolatedSerial(text, 95)).toEqual({ series: "0000", number: "123456" });
  for (const text of ["00 00 12345", "00 00 12345O", "01.02.1990 123-456", "00 00 123456 00 00 654321", "RUS0000123456"]) expect(isolatedSerial(text, 95)).toBeNull();
  expect(isolatedSerial("0000123456", 69)).toBeNull();
  expect(isolatedSerial("0000123456", NaN)).toBeNull();
});

it("finds a narrow red side strip and excludes a broad seal and black text", () => {
  const width = 500, height = 400, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const rect = (x0: number, y0: number, w: number, h: number, color: number[]) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set([...color, 255], (y * width + x) * 4);
  };
  rect(180, 160, 80, 80, [130, 30, 60]);
  rect(420, 120, 10, 180, [15, 15, 15]);
  for (let i = 0; i < 10; i++) rect(465, 70 + i * 15, 8, 10, [140, 55, 75]);
  const regions = serialRegions({ width, height, data });
  expect(regions).toHaveLength(1);
  expect(regions[0]!.left).toBeGreaterThan(450);
  expect(regions[0]!.height).toBeGreaterThan(145);
  const isolated = serialContrast({ width: 3, height: 1, data: [150, 60, 70, 255, 30, 30, 30, 255, 230, 220, 215, 255] });
  expect(isolated[0]).toBeLessThan(100); expect(isolated[4]).toBe(0); expect(isolated[8]).toBe(255);
});
