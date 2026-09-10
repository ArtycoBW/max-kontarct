import { cropSize, fullPhoto, perspectiveMap, validQuad, type Quad } from "./perspective";

describe("local four-point document crop", () => {
  const trapezoid: Quad = [{ x: .15, y: .2 }, { x: .8, y: .1 }, { x: .95, y: .85 }, { x: .05, y: .9 }];
  it("maps all four output corners to the selected source corners", () => {
    for (const quad of [fullPhoto(), trapezoid]) {
      const map = perspectiveMap(quad);
      fullPhoto().forEach((corner, index) => {
        expect(map(corner.x, corner.y).x).toBeCloseTo(quad[index]!.x, 9);
        expect(map(corner.x, corner.y).y).toBeCloseTo(quad[index]!.y, 9);
      });
    }
  });
  it("is identity for a full photo and preserves the original aspect ratio", () => {
    expect(perspectiveMap(fullPhoto())(.3, .7)).toEqual({ x: .3, y: .7 });
    expect(cropSize(fullPhoto(), 1800, 1200)).toEqual({ width: 1800, height: 1200 });
    expect(cropSize(fullPhoto(), 4000, 3000)).toEqual({ width: 2200, height: 1650 });
  });
  it("supports independent corners instead of restricting selection to a rectangle", () => {
    expect(validQuad(trapezoid)).toBe(true);
    const center = perspectiveMap(trapezoid)(.5, .5);
    expect(center.x).toBeGreaterThan(.2); expect(center.x).toBeLessThan(.8);
    expect(center.y).toBeGreaterThan(.2); expect(center.y).toBeLessThan(.9);
  });
  it("rejects crossed, concave, tiny, out-of-bounds and non-finite quadrilaterals", () => {
    const a = fullPhoto();
    const invalid: Quad[] = [[a[0], a[2], a[1], a[3]], [a[0], a[1], { x: .1, y: .1 }, a[3]],
      [{ x: .45, y: .45 }, { x: .5, y: .45 }, { x: .5, y: .5 }, { x: .45, y: .5 }],
      [{ x: -1, y: 0 }, a[1], a[2], a[3]], [{ x: NaN, y: 0 }, a[1], a[2], a[3]]];
    invalid.forEach(quad => { expect(validQuad(quad)).toBe(false); expect(() => perspectiveMap(quad)).toThrow(); });
  });
});
