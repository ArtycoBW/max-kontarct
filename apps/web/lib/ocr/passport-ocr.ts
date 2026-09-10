import { emptyPassport, type PassportPage } from "./passport-parser";
import { createLocalOcrWorker } from "./local-worker";
import { documentRedChannel, enhanceDocument } from "./image-quality";
import { mergePassportReads, normalizePassportText, readPassportLayout, type PassportRead, type PassportOcrLine } from "./passport-layout";
import { buildPassportReview } from "./passport-review";
import { mergeRegistrations, readStreetRetry } from "./registration";

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
  let pass = 0;
  let passesPerPhoto = 4;
  const reads: PassportRead[] = [];
  let rejectFailure: (reason: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  // The race is installed immediately; terminate also handles a hung WASM worker.
  const cancel = () => { rejectFailure(new Error("Распознавание отменено.")); worker?.terminate(); };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => { rejectFailure(new Error("Распознавание заняло слишком много времени. Попробуйте по одной странице или заполните данные вручную.")); worker?.terminate(); }, 150_000);
  const run = async () => {
    worker = createLocalOcrWorker(progress => {
      if (!signal.aborted) onProgress(Math.round(15 + 85 * (photoIndex + (pass + progress) / passesPerPhoto) / photos.length));
    });
    await worker.initialize();
    signal.throwIfAborted();
    onProgress(15);
    for (photoIndex = 0; photoIndex < photos.length; photoIndex++) {
      const photo = photos[photoIndex]!;
      passesPerPhoto = photo.page === "registration" ? 6 : 4;
      signal.throwIfAborted();
      const canvas = await preparePhoto(photo, signal);
      let firstLines: PassportOcrLine[] = [], firstText = "";
      let enhancedLines: PassportOcrLine[] = [];
      try {
        for (pass = 0; pass < 2; pass++) {
          signal.throwIfAborted();
          if (pass === 1) {
            const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            pixels.data.set(enhanceDocument(pixels)); ctx.putImageData(pixels, 0, 0);
          }
          const result = await worker.recognize(canvas);
          const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
          if (pass === 0) { firstLines = lines; firstText = result.text; }
          else enhancedLines = lines;
          const read = readPassportLayout(photo.page, lines, result.text);
          reads.push(read);
          const required = photo.page === "registration" ? ["address"] as const : photo.page === "issuance" ? ["issuer", "issuedAt", "divisionCode"] as const : ["firstName", "lastName", "birthDate", "series", "number"] as const;
          if (required.every(key => read.data[key]) && (photo.page !== "registration" || /(?:Д\.?|ДОМ)\s*\d/i.test(read.data.address))) break;
        }
        // Read a single uncertain surname line separately from portrait and security patterns.
        const layoutWords = (enhancedLines.length ? enhancedLines : firstLines).flatMap(line => line.words);
        const anchors = layoutWords.filter(word => word.confidence >= 60 && /^[А-ЯЁ]{2,}(?:ВИЧ|ВНА|ИЧНА)$/.test(word.text));
        if (photo.page === "identity" && anchors.length === 1 && !reads.some(read => read.data.lastName)) {
          signal.throwIfAborted(); pass = 2;
          const anchor = anchors[0]!, h = anchor.bbox.y1 - anchor.bbox.y0, cx = (anchor.bbox.x0 + anchor.bbox.x1) / 2;
          const candidates = layoutWords.filter(word => word.confidence >= 20 && /^[А-ЯЁ-]{2,40}$/.test(word.text) && !/ФАМИЛИЯ|ОТЧЕСТВО|ИМЯ/.test(word.text) && anchor.bbox.y0 - word.bbox.y0 > h * 3 && anchor.bbox.y0 - word.bbox.y0 < h * 9 && Math.abs((word.bbox.x0 + word.bbox.x1) / 2 - cx) < h * 5);
          if (candidates.length === 1) {
            const candidate = candidates[0]!, source = await preparePhoto(photo, signal), region = document.createElement("canvas");
            try {
              const margin = h * .3;
              const left = Math.max(0, candidate.bbox.x0 - margin), top = Math.max(0, candidate.bbox.y0 - margin);
              const width = Math.min(source.width - left, candidate.bbox.x1 - candidate.bbox.x0 + margin * 2), height = Math.min(source.height - top, candidate.bbox.y1 - candidate.bbox.y0 + margin * 2);
              const scale = Math.min(3, 2200 / Math.max(width, height));
              region.width = Math.round(width * scale); region.height = Math.round(height * scale);
              const ctx = region.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(source, left, top, width, height, 0, 0, region.width, region.height);
              const pixels = ctx.getImageData(0, 0, region.width, region.height);
              pixels.data.set(documentRedChannel(pixels)); ctx.putImageData(pixels, 0, 0);
              const result = await worker.recognize(region, { mode: "8", rotateAuto: false });
              const surname = result.text.trim();
              if (result.confidence >= 70 && surname === candidate.text && /^[А-ЯЁ][А-ЯЁ-]{1,39}$/.test(surname)) {
                const lastName = surname.toLocaleLowerCase("ru").replace(/(^|-)([а-яё])/g, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase("ru"));
                reads.push({ data: { ...emptyPassport, lastName }, warnings: [], mrz: false, confidence: { lastName: result.confidence }, uncertainFields: result.confidence < 85 ? ["lastName"] : [] });
              }
            } finally { source.width = 0; source.height = 0; region.width = 0; region.height = 0; }
          }
        }
        // Sparse page segmentation can split a registration stamp into unrelated fragments.
        // Retry only the stamp as a text block, preserving soft edges, in two independent views.
        const registrationReads = reads.flatMap(read => read.registration ? [read.registration] : []);
        if (photo.page === "registration" && mergeRegistrations(registrationReads).uncertain) {
          const headers = (enhancedLines.length ? enhancedLines : firstLines).filter(line => /ЗАРЕГИСТРИРОВАН/i.test(line.text));
          if (headers.length === 1 && !reads.some(read => read.registration?.ambiguous)) {
            const head = headers[0]!.bbox, h = head.y1 - head.y0, w = head.x1 - head.x0;
            const source = await preparePhoto(photo, signal);
            try {
              const left = Math.max(0, head.x0 - w * .5), top = Math.max(0, head.y0 - h);
              const width = Math.min(source.width - left, w * 1.9), height = Math.min(source.height - top, h * 19);
              const scale = Math.min(1.8, 2200 / Math.max(width, height));
              let stampLines: PassportOcrLine[] = [];
              for (pass = 2; pass < 4; pass++) {
                signal.throwIfAborted();
                const region = document.createElement("canvas"); region.width = Math.round(width * scale); region.height = Math.round(height * scale);
                try {
                  const ctx = region.getContext("2d", { willReadFrequently: true })!;
                  ctx.drawImage(source, left, top, width, height, 0, 0, region.width, region.height);
                  if (pass === 3) { const pixels = ctx.getImageData(0, 0, region.width, region.height); pixels.data.set(documentRedChannel(pixels)); ctx.putImageData(pixels, 0, 0); }
                  const result = await worker.recognize(region, { mode: "6", rotateAuto: false });
                  const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
                  if (pass === 2) stampLines = lines.map(line => ({ ...line, text: normalizePassportText(line.text), words: line.words.map(word => ({ ...word, text: normalizePassportText(word.text) })) }));
                  reads.push(readPassportLayout(photo.page, lines, result.text));
                } finally { region.width = 0; region.height = 0; }
              }
              const streets = stampLines.filter(line => /(?:^|\s)УЛ\./i.test(line.text) && !/ОТДЕЛ|МИГРАЦ|МВД/i.test(line.text));
              if (streets.length === 1) {
                const row = streets[0]!, box = row.bbox, rowHeight = box.y1 - box.y0;
                const x = left + Math.max(0, box.x0 - 8) / scale, y = top + Math.max(0, box.y0 - rowHeight * .3) / scale;
                const rw = Math.min(source.width - x, (box.x1 - box.x0 + 16) / scale), rh = Math.min(source.height - y, rowHeight * 1.6 / scale);
                for (pass = 4; pass < 6; pass++) {
                  signal.throwIfAborted();
                  const region = document.createElement("canvas"); region.width = Math.round(rw * scale * 1.3); region.height = Math.round(rh * scale * 1.3);
                  try {
                    const ctx = region.getContext("2d", { willReadFrequently: true })!;
                    ctx.drawImage(source, x, y, rw, rh, 0, 0, region.width, region.height);
                    if (pass === 5) { const pixels = ctx.getImageData(0, 0, region.width, region.height); pixels.data.set(documentRedChannel(pixels)); ctx.putImageData(pixels, 0, 0); }
                    const result = await worker.recognize(region, { mode: "7", rotateAuto: false });
                    const lines = (result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? []).map(line => ({ ...line, text: normalizePassportText(line.text), words: line.words.map(word => ({ ...word, text: normalizePassportText(word.text) })) }));
                    reads.push({ data: { ...emptyPassport }, warnings: [], mrz: false, registration: readStreetRetry(row, lines) });
                  } finally { region.width = 0; region.height = 0; }
                }
              }
            } finally { source.width = 0; source.height = 0; }
          }
        }
        // Isolate the machine-readable lines from the portrait/security background before retrying.
        if (photo.page !== "registration" && !reads.some(read => read.mrz)) {
          const mrzLines = firstLines.filter(line => line.text.replace(/\s/g, "").length >= 25 && /[<«‹]{2}|RUS/i.test(line.text));
          if (mrzLines.length) {
            signal.throwIfAborted(); pass = 3;
            const source = await preparePhoto(photo, signal), region = document.createElement("canvas");
            try {
              const left = Math.max(0, Math.min(...mrzLines.map(line => line.bbox.x0)) - 24);
              const top = Math.max(0, Math.min(...mrzLines.map(line => line.bbox.y0)) - 16);
              const height = Math.max(...mrzLines.map(line => line.bbox.y1 - line.bbox.y0));
              const right = Math.min(source.width, Math.max(...mrzLines.map(line => line.bbox.x1)) + 24);
              const bottom = Math.min(source.height, Math.max(...mrzLines.map(line => line.bbox.y1)) + height * 3);
              region.width = right - left; region.height = bottom - top;
              region.getContext("2d")!.drawImage(source, left, top, region.width, region.height, 0, 0, region.width, region.height);
              const result = await worker.recognize(region, { mode: "6", whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<" });
              const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
              const read = readPassportLayout(photo.page, lines, firstText + "\n" + result.text);
              if (read.mrz) reads.push(read);
            } finally { source.width = 0; source.height = 0; region.width = 0; region.height = 0; }
          }
        }
      } finally { canvas.width = 0; canvas.height = 0; }
    }
    const { data, conflicts, uncertain } = mergePassportReads(reads);
    onProgress(100);
    return buildPassportReview(data, photos.map(photo => photo.page), conflicts, uncertain);
  };
  try { return await Promise.race([run(), failure]); }
  finally { clearTimeout(timeout); signal.removeEventListener("abort", cancel); worker?.terminate(); }
}
