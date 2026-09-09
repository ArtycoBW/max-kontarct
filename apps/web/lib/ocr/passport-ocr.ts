import { parsePassportPages, type PassportPage } from "./passport-parser";
import { createLocalOcrWorker } from "./local-worker";

export type PassportPhoto = { page: PassportPage; file: File; rotation: number };
export function validatePassportPhoto(file: Pick<File, "size" | "type">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Выберите фотографию JPG, PNG или WebP. HEIC и PDF нужно предварительно преобразовать в JPG.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Фотография слишком большая. Максимум — 12 МБ на страницу.");
  if (!file.size) throw new Error("Файл пустой. Выберите другую фотографию.");
}
async function preparePhoto(photo: PassportPhoto, signal: AbortSignal) {
  validatePassportPhoto(photo.file);
  signal.throwIfAborted();
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(photo.file); }
  catch { throw new Error("Не удалось открыть фотографию. Возможно, файл повреждён. Выберите другой снимок JPG или PNG."); }
  try {
    signal.throwIfAborted();
    if (bitmap.width * bitmap.height > 40_000_000 || Math.min(bitmap.width, bitmap.height) < 300) throw new Error("Нужен чёткий снимок страницы: от 300 пикселей по короткой стороне и до 40 мегапикселей.");
    const scale = Math.min(2, 2200 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
    const rotated = photo.rotation % 180 !== 0;
    const canvas = document.createElement("canvas");
    canvas.width = rotated ? height : width; canvas.height = rotated ? width : height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Браузер не поддерживает обработку изображений.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(photo.rotation * Math.PI / 180);
    ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
    return canvas;
  } finally { bitmap.close(); }
}

export async function recognizePassport(photos: PassportPhoto[], signal: AbortSignal, onProgress: (progress: number) => void) {
  if (!photos.length || photos.length > 3 || new Set(photos.map(photo => photo.page)).size !== photos.length) throw new Error("Добавьте от одной до трёх разных страниц.");
  if (typeof createImageBitmap !== "function" || typeof WebAssembly === "undefined") throw new Error("Этот браузер не поддерживает локальное распознавание. Откройте приложение в обновлённом браузере или заполните данные вручную.");
  photos.forEach(photo => validatePassportPhoto(photo.file));
  signal.throwIfAborted();
  let worker: ReturnType<typeof createLocalOcrWorker> | undefined;
  let photoIndex = 0;
  const text: Partial<Record<PassportPage, string>> = {};
  const lowQuality: string[] = [];
  let rejectFailure: (reason: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  // The race is installed immediately; terminate also handles a hung WASM worker.
  const cancel = () => { rejectFailure(new Error("Распознавание отменено.")); worker?.terminate(); };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => { rejectFailure(new Error("Распознавание заняло слишком много времени. Попробуйте по одной странице или заполните данные вручную.")); worker?.terminate(); }, 150_000);
  const run = async () => {
    worker = createLocalOcrWorker(progress => {
      if (!signal.aborted) onProgress(Math.round(15 + 85 * (photoIndex + progress) / photos.length));
    });
    await worker.initialize();
    signal.throwIfAborted();
    onProgress(15);
    for (photoIndex = 0; photoIndex < photos.length; photoIndex++) {
      const photo = photos[photoIndex]!;
      signal.throwIfAborted();
      const canvas = await preparePhoto(photo, signal);
      try {
        const result = await worker.recognize(canvas);
        const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
        // Do not turn low-confidence noise into a person's name or address.
        text[photo.page] = lines.filter(line => line.confidence >= 60).map(line => line.text).join("\n");
        if (result.confidence < 65 || !text[photo.page] || lines.some(line => line.confidence < 60)) lowQuality.push(photo.page);
      } finally { canvas.width = 0; canvas.height = 0; }
    }
    const parsed = parsePassportPages(text);
    if (lowQuality.length) parsed.warnings.unshift("На части снимков низкая чёткость распознавания. Внимательно проверьте каждое поле.");
    return parsed;
  };
  try { return await Promise.race([run(), failure]); }
  finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); worker?.terminate(); }
}
