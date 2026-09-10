import { createLocalOcrWorker } from "./local-worker";
import { corroborateFields, detectLiveFields, fieldPixelsChanged, goodCapture, liveCaptureReady, type LiveField } from "./live-fields";
import { cameraCrop, inspectCapture, type CaptureQuality } from "./image-quality";
import { createHintStabilizer, type CaptureHint } from "./live-hints";
import type { Quad } from "./perspective";
import type { PassportPage } from "./passport-parser";

export type LiveScanState = { fields: LiveField[]; phase: "loading" | "scanning" | "unavailable"; quality: CaptureQuality | null; hint: CaptureHint };
type Area = { left: number; top: number; width: number; height: number };

/** One local worker, one in-flight frame, bounded resolution and freshness. No frame queue or uploads. */
export function startLiveScanner(video: HTMLVideoElement, page: PassportPage, crop: () => Area | null, report: (state: LiveScanState) => void, autoCapture?: (file: File, corners: Quad) => void) {
  let stopped = false, initialized = false, working = false, failed = false;
  let previous: Uint8Array | undefined, fields: LiveField[] = [], quality: CaptureQuality | null = null;
  let epoch = 0, lastRead = 0, nextRead = 0, layout = "", poorSince = 0;
  const hint = createHintStabilizer();
  let worker: ReturnType<typeof createLocalOcrWorker> | undefined;
  let jobTimer: ReturnType<typeof setTimeout> | undefined;
  const analysis = document.createElement("canvas"), snapshot = document.createElement("canvas"), fullFrame = document.createElement("canvas");
  const ctx = analysis.getContext("2d", { willReadFrequently: true });
  const publish = () => { if (!stopped) report({ fields, quality, hint: hint(quality, performance.now()), phase: failed ? "unavailable" : initialized ? "scanning" : "loading" }); };
  const invalidate = () => { epoch++; fields = []; previous = undefined; lastRead = 0; };
  const unavailable = () => { failed = true; invalidate(); worker?.terminate(); clearTimeout(jobTimer); publish(); };
  const stop = () => { stopped = true; clearInterval(qualityTimer); clearTimeout(jobTimer); worker?.terminate(); fields = []; previous = undefined; analysis.width = 0; analysis.height = 0; snapshot.width = 0; snapshot.height = 0; fullFrame.width = 0; fullFrame.height = 0; };
  const read = async (area: Area) => {
    if (!worker || working || !initialized || failed) return;
    const requestEpoch = epoch; working = true;
    try {
      const scale = Math.min(1, 1400 / Math.max(area.width, area.height));
      snapshot.width = Math.round(area.width * scale); snapshot.height = Math.round(area.height * scale);
      const context = snapshot.getContext("2d"); if (!context) throw new Error();
      const view = video.getBoundingClientRect();
      const visible = cameraCrop(video.videoWidth, video.videoHeight, view.width, view.height, { x: 0, y: 0, width: view.width, height: view.height });
      if (autoCapture) {
        const fullScale = Math.min(1, 2200 / Math.max(visible.width, visible.height));
        fullFrame.width = Math.round(visible.width * fullScale); fullFrame.height = Math.round(visible.height * fullScale);
        fullFrame.getContext("2d")!.drawImage(video, visible.left, visible.top, visible.width, visible.height, 0, 0, fullFrame.width, fullFrame.height);
        const sx = fullFrame.width / visible.width, sy = fullFrame.height / visible.height;
        context.drawImage(fullFrame, (area.left - visible.left) * sx, (area.top - visible.top) * sy, area.width * sx, area.height * sy, 0, 0, snapshot.width, snapshot.height);
      } else context.drawImage(video, area.left, area.top, area.width, area.height, 0, 0, snapshot.width, snapshot.height);
      // A hung recognition job must never keep the camera/worker alive indefinitely.
      jobTimer = setTimeout(unavailable, 12_000);
      const result = await worker.recognize(snapshot, { mode: "11", rotateAuto: false });
      if (stopped || failed || requestEpoch !== epoch || !goodCapture(quality)) return;
      const lines = result.blocks?.flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines)) ?? [];
      fields = corroborateFields(fields, detectLiveFields(page, lines, snapshot.width, snapshot.height)); lastRead = performance.now(); publish();
      if (autoCapture && liveCaptureReady(page, fields, quality)) {
        // Freeze the exact frame that OCR read, never a later video frame after its result.
        const blob = await new Promise<Blob | null>(resolve => fullFrame.toBlob(resolve, "image/jpeg", .95));
        if (!blob || stopped || failed || requestEpoch !== epoch || !goodCapture(quality)) return;
        const left = (area.left - visible.left) / visible.width, top = (area.top - visible.top) / visible.height;
        const right = left + area.width / visible.width, bottom = top + area.height / visible.height;
        stop();
        autoCapture(new File([blob], `passport-${page}.jpg`, { type: "image/jpeg" }), [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]);
      }
    } catch { if (!stopped && !failed) unavailable(); }
    finally { working = false; clearTimeout(jobTimer); nextRead = performance.now() + 1200; snapshot.width = 0; snapshot.height = 0; fullFrame.width = 0; fullFrame.height = 0; }
  };
  const tick = () => {
    if (stopped || document.hidden) return;
    const area = crop();
    if (!ctx || !area || video.readyState < 2) { invalidate(); quality = null; publish(); return; }
    const currentLayout = [area.left, area.top, area.width, area.height].join(":");
    if (layout !== currentLayout) { layout = currentLayout; invalidate(); }
    analysis.width = 240; analysis.height = Math.round(240 * area.height / area.width);
    try {
      ctx.drawImage(video, area.left, area.top, area.width, area.height, 0, 0, analysis.width, analysis.height);
      const result = inspectCapture(ctx.getImageData(0, 0, analysis.width, analysis.height), previous);
      if (fieldPixelsChanged(previous, result.gray, analysis.width, analysis.height, fields)) result.quality.moving = true;
      previous = result.gray; quality = result.quality;
      const now = performance.now();
      if (goodCapture(quality)) poorSince = 0;
      else if (!poorSince) poorSince = now;
      // Do not throw away corroboration on one exposure/focus fluctuation. Motion still
      // invalidates coordinates immediately; real persistent degradation clears values too.
      if (quality.moving || (poorSince && now - poorSince >= 1200)) { epoch++; fields = []; lastRead = 0; }
      if (lastRead && now - lastRead > 8000) { epoch++; fields = []; lastRead = 0; }
      publish();
      if (goodCapture(quality) && performance.now() >= nextRead) void read(area);
    } catch { quality = null; unavailable(); }
  };
  const qualityTimer = setInterval(tick, 400);
  try {
    worker = createLocalOcrWorker(() => {});
    jobTimer = setTimeout(unavailable, 25_000);
    void worker.initialize().then(() => { if (!stopped && !failed) { clearTimeout(jobTimer); initialized = true; publish(); } }).catch(() => { if (!stopped && !failed) unavailable(); });
  } catch { unavailable(); }
  publish(); tick();
  return { stop };
}
