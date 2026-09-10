export type Point = { x: number; y: number };
/** Clockwise, normalized image coordinates: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];
export const fullPhoto = (): Quad => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function validQuad(points: Quad): boolean {
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i]!, b = points[(i + 1) % 4]!, c = points[(i + 2) % 4]!;
    if (distance(a, b) < .04 || (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < .002) return false;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2 >= .03;
}

/** Inverse projective mapping. Unlike a rectangular crop, this straightens all four edges. */
export function perspectiveMap(points: Quad) {
  if (!validQuad(points)) throw new Error("Раздвиньте углы. Стороны рамки не должны пересекаться.");
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
  return (u: number, v: number): Point => {
    const divisor = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / divisor, y: (d * u + e * v + p0.y) / divisor };
  };
}

export function cropSize(points: Quad, width: number, height: number, limit = 2200) {
  const pixels = points.map(p => ({ x: p.x * width, y: p.y * height }));
  const w = Math.max(distance(pixels[0]!, pixels[1]!), distance(pixels[3]!, pixels[2]!));
  const h = Math.max(distance(pixels[0]!, pixels[3]!), distance(pixels[1]!, pixels[2]!));
  const scale = Math.min(1, limit / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Bounded local processing, yielding between rows so cancel/close remains responsive on phones. */
export async function rectifyPhoto(source: HTMLCanvasElement, points: Quad, signal: AbortSignal) {
  signal.throwIfAborted();
  const map = perspectiveMap(points), size = cropSize(points, source.width, source.height);
  if (Math.min(size.width, size.height) < 300) throw new Error("Выбранная область слишком мала для чтения текста. Раздвиньте углы или снимите страницу крупнее.");
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Не удалось обработать фото в этом браузере.");
  const input = ctx.getImageData(0, 0, source.width, source.height);
  const output = document.createElement("canvas"); output.width = size.width; output.height = size.height;
  try {
    const target = output.getContext("2d");
    if (!target) throw new Error("Не удалось обработать фото в этом браузере.");
    const pixels = target.createImageData(size.width, size.height);
    for (let y = 0; y < size.height; y++) {
      if (y % 32 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); signal.throwIfAborted(); }
      for (let x = 0; x < size.width; x++) {
        const p = map(x / (size.width - 1), y / (size.height - 1));
        const sx = Math.max(0, Math.min(source.width - 1, p.x * (source.width - 1)));
        const sy = Math.max(0, Math.min(source.height - 1, p.y * (source.height - 1)));
        const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, source.width - 1), y1 = Math.min(y0 + 1, source.height - 1);
        const fx = sx - x0, fy = sy - y0, index = (y * size.width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const top = input.data[(y0 * source.width + x0) * 4 + c]! * (1 - fx) + input.data[(y0 * source.width + x1) * 4 + c]! * fx;
          const bottom = input.data[(y1 * source.width + x0) * 4 + c]! * (1 - fx) + input.data[(y1 * source.width + x1) * 4 + c]! * fx;
          pixels.data[index + c] = top * (1 - fy) + bottom * fy;
        }
        pixels.data[index + 3] = 255;
      }
    }
    target.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, "image/jpeg", .95));
    signal.throwIfAborted();
    if (!blob) throw new Error("Не удалось подготовить обрезанное фото.");
    return blob;
  } finally { output.width = 0; output.height = 0; }
}
