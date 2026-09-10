export type PixelImage = { data: ArrayLike<number>; width: number; height: number };

export type CaptureQuality = { dark: boolean; glare: boolean; soft: boolean; moving: boolean };
export function inspectCapture(image: PixelImage, previous?: Uint8Array): { quality: CaptureQuality; gray: Uint8Array } {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  let sum = 0, dark = 0, movement = 0, lapSum = 0, lapSquares = 0, count = 0;
  const tiles = Array.from({ length: 64 }, () => ({ sum: 0, clipped: 0, count: 0 }));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 4;
    const value = Math.round(data[p]! * .299 + data[p + 1]! * .587 + data[p + 2]! * .114);
    gray[i] = value; sum += value; if (value < 55) dark++;
    if (previous?.length === gray.length) movement += Math.abs(value - previous[i]!);
    const tile = tiles[Math.min(7, Math.floor(y * 8 / height)) * 8 + Math.min(7, Math.floor(x * 8 / width))]!;
    tile.sum += value; if (value > 251) tile.clipped++; tile.count++;
  }
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const lap = gray[i - 1]! + gray[i + 1]! + gray[i - width]! + gray[i + width]! - 4 * gray[i]!;
    lapSum += lap; lapSquares += lap * lap; count++;
  }
  const mean = sum / gray.length;
  const tileMeans = tiles.map(tile => tile.count ? tile.sum / tile.count : 0);
  // A uniformly white sheet is not a glare. Look for localized clipped, textureless highlights.
  // Allow highlight boundaries to cross tiles; requiring whole white tiles misses small glare.
  const clipped = tiles.filter(tile => tile.count && tile.clipped / tile.count > .5).length;
  return { gray, quality: {
    dark: mean < 85 || dark / gray.length > .48,
    glare: clipped >= 2 && clipped <= 32 && tileMeans.filter(value => value > 65 && value < 205).length >= 8,
    soft: count > 0 && lapSquares / count - (lapSum / count) ** 2 < 65,
    moving: Boolean(previous?.length === gray.length && movement / gray.length > 16),
  } };
}

/** Map a guide drawn over object-fit: cover video back to source pixels. */
export function cameraCrop(sourceWidth: number, sourceHeight: number, viewWidth: number, viewHeight: number, guide: { x: number; y: number; width: number; height: number }) {
  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  const left = Math.max(0, Math.round((sourceWidth - viewWidth / scale) / 2 + guide.x / scale));
  const top = Math.max(0, Math.round((sourceHeight - viewHeight / scale) / 2 + guide.y / scale));
  return { left, top, width: Math.max(1, Math.min(sourceWidth - left, Math.round(guide.width / scale))), height: Math.max(1, Math.min(sourceHeight - top, Math.round(guide.height / scale))) };
}

/** Local illumination removal; suppresses pale security patterns without uploading pixels. */
export function enhanceDocument(image: PixelImage): Uint8ClampedArray {
  const { width, height, data } = image;
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      const value = Math.round(data[p]! * .7 + data[p + 1]! * .2 + data[p + 2]! * .1);
      gray[i] = value; sum += value;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + sum;
    }
  }
  const radius = Math.max(12, Math.round(width / 60));
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
      const mean = (integral[bottom * stride + right]! - integral[top * stride + right]! - integral[bottom * stride + left]! + integral[top * stride + left]!) / ((bottom - top) * (right - left));
      const i = y * width + x, p = i * 4;
      const color = gray[i]! < mean - 22 ? 0 : 255;
      output[p] = color; output[p + 1] = color; output[p + 2] = color; output[p + 3] = 255;
    }
  }
  return output;
}
