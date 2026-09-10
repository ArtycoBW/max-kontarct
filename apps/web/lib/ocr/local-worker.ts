import type { Page as OcrPage } from "tesseract.js";

/**
 * Small transport for the pinned Tesseract.js 7 worker distribution.
 * Keep the native Worker handle from the first instant: createWorker() only exposes
 * it after model initialization, which cannot reliably be cancelled on a lost network.
 * The real-WASM browser test covers this protocol; update it when upgrading Tesseract.
 */
export function createLocalOcrWorker(progress: (value: number) => void) {
  const native = new Worker("/ocr/worker.min.js");
  let serial = 0;
  let stopped = false;
  const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>();
  const unavailable = () => new Error("Не удалось загрузить модуль распознавания или прочитать снимок. Проверьте соединение и попробуйте ещё раз.");
  const terminate = (error = new Error("Распознавание отменено.")) => {
    if (stopped) return;
    stopped = true; native.terminate();
    pending.forEach(job => job.reject(error)); pending.clear();
  };
  native.onerror = event => { event.preventDefault(); terminate(unavailable()); };
  native.onmessageerror = () => terminate(unavailable());
  native.onmessage = ({ data: message }) => {
    if (stopped) return;
    if (message.status === "progress") {
      if (message.data?.status === "recognizing text") progress(message.data.progress);
      return;
    }
    const job = pending.get(message.jobId);
    if (!job) return;
    pending.delete(message.jobId);
    if (message.status === "resolve") job.resolve(message.data);
    else { const error = unavailable(); job.reject(error); terminate(error); }
  };
  const send = (action: string, payload: unknown) => new Promise<unknown>((resolve, reject) => {
    if (stopped) { reject(new Error("Распознавание отменено.")); return; }
    const jobId = `passport-${++serial}`;
    pending.set(jobId, { resolve, reject });
    try { native.postMessage({ workerId: "passport", jobId, action, payload }); }
    catch { pending.delete(jobId); reject(unavailable()); terminate(unavailable()); }
  });
  return {
    async initialize() {
      await send("load", { options: { lstmOnly: true, corePath: new URL("/ocr/core", location.origin).href, logging: false } });
      await send("loadLanguage", { langs: ["rus", "eng"], options: { langPath: new URL("/ocr/lang", location.origin).href, gzip: true, lstmOnly: true, cacheMethod: "write" } });
      await send("initialize", { langs: ["rus", "eng"], oem: 1, config: {} });
      await send("setParameters", { params: { tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" } });
    },
    async recognize(canvas: HTMLCanvasElement, options: { mode?: "6" | "11" | "7" | "8"; whitelist?: string; rotateAuto?: boolean; imageColor?: boolean } = {}) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(unavailable()), "image/png"));
      const image = new Uint8Array(await blob.arrayBuffer());
      return await send("recognize", { image, options: { rotateAuto: options.rotateAuto ?? true, tessedit_pageseg_mode: options.mode ?? "11", user_defined_dpi: "300", ...(options.whitelist ? { tessedit_char_whitelist: options.whitelist } : {}) }, output: { text: true, blocks: true, imageColor: options.imageColor ?? false } }) as OcrPage;
    },
    terminate,
  };
}
