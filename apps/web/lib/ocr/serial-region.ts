import type { PixelImage } from "./image-quality";
import type { createLocalOcrWorker } from "./local-worker";
import { rotateDocument } from "./orientation";

type Region = { left: number; top: number; width: number; height: number };
type Serial = { series: string; number: string };
const redInk = (r: number, g: number, b: number) => r < 180 && g < 145 && b < 160 && r - g > 10 && r - b > 2;

/** Locate aligned red glyphs, not the seal or black dates. Coordinates are
 * measured from pixels; the number itself is never inferred from a page template. */
export function serialRegions(image: PixelImage): Region[] {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = Number(redInk(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!));
  const glyphs: Region[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const queue = [i]; mask[i] = 0;
    let x0 = i % width, x1 = x0, y0 = Math.floor(i / width), y1 = y0;
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q]!, x = index % width, y = Math.floor(index / width);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[next]) { mask[next] = 0; queue.push(next); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (queue.length >= 8 && w >= 3 && h >= 3 && Math.max(w, h) < Math.max(width, height) * .055) glyphs.push({ left: x0, top: y0, width: w, height: h });
  }
  // Bound work on patterned backgrounds; contours are only candidate regions.
  const candidates = glyphs.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 600);
  const result: (Region & { score: number })[] = [];
  for (const vertical of [true, false]) for (const seed of candidates) {
    const across = (box: Region) => vertical ? box.left + box.width / 2 : box.top + box.height / 2;
    const along = (box: Region) => vertical ? box.top : box.left;
    const thickness = (box: Region) => vertical ? box.width : box.height;
    const size = (box: Region) => vertical ? box.height : box.width;
    const peers = candidates.filter(box => Math.abs(across(box) - across(seed)) < thickness(seed) * .8 && thickness(box) >= thickness(seed) * .5 && thickness(box) <= thickness(seed) * 1.6 && size(box) >= size(seed) * .45 && size(box) <= size(seed) * 1.8).sort((a, b) => along(a) - along(b));
    let group: Region[] = [];
    const accept = () => {
      // Fine serif strokes can be disconnected after JPEG compression. Count
      // overlapping positions as one glyph instead of rejecting a fragmented row.
      const spans: { start: number; end: number }[] = [];
      for (const box of group) {
        const previous = spans.at(-1), start = along(box), end = start + size(box);
        if (previous && start < previous.end) previous.end = Math.max(previous.end, end);
        else spans.push({ start, end });
      }
      if (spans.length < 7 || spans.length > 13) return;
      const x0 = Math.min(...group.map(box => box.left)), y0 = Math.min(...group.map(box => box.top));
      const w = Math.max(...group.map(box => box.left + box.width)) - x0, h = Math.max(...group.map(box => box.top + box.height)) - y0;
      if (Math.max(w, h) / Math.min(w, h) < 5) return;
      const margin = Math.max(8, Math.min(w, h) * .7);
      const left = Math.max(0, Math.floor(x0 - margin)), top = Math.max(0, Math.floor(y0 - margin));
      if (result.some(box => Math.abs(box.left - left) < margin && Math.abs(box.top - top) < margin)) return;
      result.push({ left, top, width: Math.min(width - left, Math.ceil(w + 2 * margin)), height: Math.min(height - top, Math.ceil(h + 2 * margin)), score: Math.abs(10 - spans.length) });
    };
    for (const box of peers) {
      const previous = group.at(-1);
      if (previous && along(box) - along(previous) - size(previous) > size(seed) * 3) { accept(); group = []; }
      group.push(box);
    }
    accept();
  }
  return result.sort((a, b) => a.score - b.score).slice(0, 4).map(({ left, top, width, height }) => ({ left, top, width, height }));
}

export function serialContrast(image: PixelImage) {
  const result = new Uint8ClampedArray(image.width * image.height * 4);
  const histogram = new Uint32Array(256);
  for (let p = 0; p < result.length; p += 4) { const value = image.data[p + 1]!; histogram[value] = histogram[value]! + 1; }
  const percentile = (fraction: number) => { let total = 0; for (let value = 0; value < 256; value++) { total += histogram[value]!; if (total >= image.width * image.height * fraction) return value; } return 255; };
  const low = percentile(.02), high = Math.max(low + 20, percentile(.97));
  for (let p = 0; p < result.length; p += 4) {
    // The green channel contrasts red ink against the pale background but also
    // preserves dark/unsaturated strokes that a strict red-only mask would erase.
    const value = Math.min(255, Math.max(0, (image.data[p + 1]! - low) * 255 / (high - low)));
    result[p] = result[p + 1] = result[p + 2] = value; result[p + 3] = 255;
  }
  return result;
}

/** Only call on an isolated printed-number strip, never a whole page or MRZ. */
export function isolatedSerial(text: string, confidence: number): Serial | null {
  const value = text.trim();
  if (!Number.isFinite(confidence) || confidence < 70 || !/^(?:\d\s*){10}$/.test(value)) return null;
  const digits = value.replace(/\s/g, "");
  return { series: digits.slice(0, 4), number: digits.slice(4) };
}

export async function readSerialRegion(source: HTMLCanvasElement, worker: Pick<ReturnType<typeof createLocalOcrWorker>, "recognize">, signal: AbortSignal) {
  const context = source.getContext("2d", { willReadFrequently: true })!;
  const regions = serialRegions(context.getImageData(0, 0, source.width, source.height));
  for (const box of regions) for (const angle of box.width > box.height ? [0, 180] : [90, 270]) {
    const candidates: Serial[] = [];
    for (let view = 0; view < 2; view++) {
      signal.throwIfAborted();
      const crop = document.createElement("canvas"); crop.width = box.width; crop.height = box.height;
      let rotated: HTMLCanvasElement | undefined, padded: HTMLCanvasElement | undefined;
      try {
        const ctx = crop.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(source, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height);
        if (view) { const pixels = ctx.getImageData(0, 0, crop.width, crop.height); pixels.data.set(serialContrast(pixels)); ctx.putImageData(pixels, 0, 0); }
        rotated = rotateDocument(crop, angle);
        // Excessive enlargement makes the security grid compete with digit strokes.
        // Keep two moderate, distinct views; deskew only the isolated contrast strip.
        const scale = Math.min(view ? 1.5 : 2, 1800 / rotated.width);
        padded = document.createElement("canvas"); padded.width = Math.round(rotated.width * scale) + 24; padded.height = Math.round(rotated.height * scale) + 24;
        const target = padded.getContext("2d")!;
        target.fillStyle = "white"; target.fillRect(0, 0, padded.width, padded.height);
        target.drawImage(rotated, 12, 12, padded.width - 24, padded.height - 24);
        const result = await worker.recognize(padded, { mode: "7", rotateAuto: Boolean(view), whitelist: "0123456789 " });
        const candidate = isolatedSerial(result.text, result.confidence);
        if (candidate) candidates.push(candidate);
      } finally { crop.width = crop.height = 0; if (rotated) rotated.width = rotated.height = 0; if (padded) padded.width = padded.height = 0; }
    }
    // Two distinct pixel views must agree. Do not fill a number on a lone guess.
    if (candidates.length === 2 && candidates[0]!.series === candidates[1]!.series && candidates[0]!.number === candidates[1]!.number) return candidates[0]!;
  }
  return null;
}
