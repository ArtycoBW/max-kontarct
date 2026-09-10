import { cameraCrop, documentRedChannel, enhanceDocument, inspectCapture } from "./image-quality";

function pixels(value: (x: number, y: number) => number) {
  const width = 128, height = 128, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value(x, y); data[i + 3] = 255;
  }
  return { width, height, data };
}
describe("local capture hints (synthetic pixels only)", () => {
  it("keeps soft edges in the red channel without mutating the source", () => {
    const source = { width: 2, height: 1, data: new Uint8ClampedArray([72, 30, 20, 255, 180, 110, 95, 255]) };
    expect(documentRedChannel(source)).toEqual(new Uint8ClampedArray([72, 72, 72, 255, 180, 180, 180, 255]));
    expect(source.data[1]).toBe(30);
  });
  it("detects darkness, low detail and motion without treating plain white paper as glare", () => {
    expect(inspectCapture(pixels(() => 30)).quality.dark).toBe(true);
    const white = inspectCapture(pixels(() => 255));
    expect(white.quality).toMatchObject({ dark: false, glare: false, soft: true, moving: false });
    expect(inspectCapture(pixels((x, y) => (x + y) % 2 ? 230 : 70)).quality.soft).toBe(false);
    expect(inspectCapture(pixels(() => 120), white.gray).quality.moving).toBe(true);
  });
  it("flags only localized clipped highlights as possible glare", () => {
    expect(inspectCapture(pixels((x, y) => x >= 48 && x < 80 && y >= 48 && y < 80 ? 255 : 150)).quality.glare).toBe(true);
    expect(inspectCapture(pixels((x, y) => x >= 52 && x < 76 && y >= 52 && y < 76 ? 255 : 150)).quality.glare).toBe(true);
    expect(inspectCapture(pixels(() => 220)).quality.glare).toBe(false);
  });
  it("maps the visible guide through cover scaling, not through stretched video", () => {
    expect(cameraCrop(1920, 1080, 300, 400, { x: 30, y: 40, width: 240, height: 320 })).toEqual({ left: 636, top: 108, width: 648, height: 864 });
    const crop = cameraCrop(1080, 1920, 300, 400, { x: 30, y: 40, width: 240, height: 320 });
    expect(crop.left).toBeGreaterThanOrEqual(0); expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.width).toBeLessThanOrEqual(1080); expect(crop.top + crop.height).toBeLessThanOrEqual(1920);
  });
  it("removes uneven illumination while retaining dark ink and opaque pixels", () => {
    const source = pixels((x, y) => x >= 60 && x < 64 && y > 10 && y < 110 ? 30 : 130 + Math.floor(x / 2));
    const original = source.data.slice();
    const enhanced = enhanceDocument(source);
    expect(enhanced[(64 * 128 + 61) * 4]).toBe(0);
    expect(enhanced[(64 * 128 + 10) * 4]).toBe(255);
    expect(enhanced.filter((_, i) => i % 4 === 3).every(value => value === 255)).toBe(true);
    expect(source.data).toEqual(original);
  });
});
