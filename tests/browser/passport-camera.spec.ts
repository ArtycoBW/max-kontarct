import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

type CameraState = {
  calls: MediaStreamConstraints[]; stopped: number; mode: "dark" | "glare" | "sharp" | "document";
  deny: boolean; pending: boolean; release?: () => void;
  workerStopped: number; reads: number; ocrDelay: number; weak: boolean;
};
type TestWindow = Window & { cameraTest: CameraState };
test.beforeEach(async ({ page }, info) => {
  const syntheticCameraSupported = await page.evaluate(() => typeof document.createElement("canvas").captureStream === "function");
  test.skip(!syntheticCameraSupported && !info.title.includes("denial"), "This browser port has no canvas.captureStream for the synthetic camera; real-device camera verification is separate");
});
async function cameraMock(context: BrowserContext, stubOcr = true) {
  await context.addInitScript((stubOcr: boolean) => {
    const state = (window as unknown as TestWindow).cameraTest = { calls: [], stopped: 0, mode: "dark", deny: false, pending: false, workerStopped: 0, reads: 0, ocrDelay: 80, weak: false };
    // Deterministic OCR for camera lifecycle/overlay tests. Real WASM is covered separately.
    if (stubOcr) Object.defineProperty(window, "Worker", { configurable: true, value: class {
      onmessage?: (message: { data: unknown }) => void;
      ended = false;
      postMessage(message: { action: string; jobId: string; payload: { image?: Uint8Array } }) {
        const recognizing = message.action === "recognize";
        if (recognizing) state.reads++;
        const pixels = message.payload.image;
        const view = pixels ? new DataView(pixels.buffer, pixels.byteOffset, pixels.byteLength) : null;
        const width = view?.getUint32(16) ?? 800, height = view?.getUint32(20) ?? 600;
        const rows = ["ФАМИЛИЯ ПРИМЕРОВ", "ИМЯ ИВАН", "ОТЧЕСТВО ИВАНОВИЧ", "ДАТА РОЖДЕНИЯ 01.02.1990"];
        const lines = rows.map((text, i) => {
          const words = text.split(" ").map((text, j) => ({ text, confidence: state.weak ? 30 : 95, bbox: { x0: width * (.08 + j * .23), x1: width * (.08 + j * .23 + .2), y0: height * (.15 + i * .18), y1: height * (.21 + i * .18) } }));
          return { text, confidence: 95, words, bbox: { x0: words[0].bbox.x0, x1: words.at(-1)!.bbox.x1, y0: words[0].bbox.y0, y1: words[0].bbox.y1 } };
        });
        setTimeout(() => { if (!this.ended) this.onmessage?.({ data: { jobId: message.jobId, status: "resolve", data: recognizing ? { text: rows.join("\n"), blocks: [{ paragraphs: [{ lines }] }] } : {} } }); }, recognizing ? state.ocrDelay : 0);
      }
      terminate() { if (!this.ended) state.workerStopped++; this.ended = true; }
    } });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async (constraints: MediaStreamConstraints) => {
      state.calls.push(constraints);
      if (state.deny) throw new DOMException("Test denial", "NotAllowedError");
      if (state.pending) await new Promise<void>(resolve => { state.release = resolve; });
      // Only invented pixels. Never opens a real camera or records a real document.
      const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 768;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = state.mode === "dark" ? "#141414" : "#999"; ctx.fillRect(0, 0, 1024, 768);
        if (state.mode === "glare") { ctx.fillStyle = "#fff"; ctx.fillRect(440, 310, 144, 144); }
        if (state.mode === "sharp") {
          ctx.fillStyle = "#111";
          for (let y = 0; y < 768; y += 20) for (let x = 0; x < 1024; x += 20) ctx.fillRect(x, y, 8, 8);
        }
        if (state.mode === "document") {
          ctx.fillStyle = "#eee9dd"; ctx.fillRect(0, 0, 1024, 768);
          ctx.fillStyle = "#111"; ctx.font = "bold 30px Arial";
          ["ФАМИЛИЯ ПРИМЕРОВ", "ИМЯ ИВАН", "ОТЧЕСТВО ИВАНОВИЧ", "ДАТА РОЖДЕНИЯ 01.02.1990"].forEach((text, i) => ctx.fillText(text, 200, 230 + i * 90));
        }
      };
      draw(); const timer = setInterval(draw, 100);
      const stream = canvas.captureStream(10);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { state.stopped++; clearInterval(timer); stop(); canvas.width = 0; canvas.height = 0; };
      }
      return stream;
    } });
  }, stubOcr);
}
async function openScanner(page: Page) {
  await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
}
async function counters(page: Page) {
  return page.evaluate(() => { const state = (window as unknown as TestWindow).cameraTest; return { calls: state.calls.length, stopped: state.stopped }; });
}

test("passport camera is opt-in, checks light locally, crops a preview and never saves the profile", async ({ browser }) => {
  const context = await actor(browser, 76001, "+79997006001"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  const before = await (await page.request.get("/api/v1/profile")).json();
  const writes: string[] = [], external: string[] = [];
  page.on("request", request => {
    if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url());
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== "http://127.0.0.1:4300") external.push(request.url());
  });
  expect(await counters(page)).toEqual({ calls: 0, stopped: 0 });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.calls[0])).toMatchObject({ audio: false, video: { facingMode: { ideal: "environment" } } });
  await expect(dialog.getByRole("status")).toContainText("Темно:");
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.mode = "glare"; });
  await expect(dialog.getByRole("status")).toContainText("Возможен блик:");
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.mode = "sharp"; });
  await expect(dialog.getByRole("status")).toContainText("Света достаточно");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 }); await noOverflow(page);
    // Read both rectangles in the same frame; separate calls can straddle a resize.
    await expect.poll(() => dialog.locator(".passport-camera-view").evaluate(element => {
      const view = element.getBoundingClientRect(), guide = element.querySelector(".passport-camera-guide")!.getBoundingClientRect();
      return guide.width > guide.height && Math.abs(guide.width / guide.height - 125 / 88) < .02 && guide.x > view.x && guide.right < view.right && guide.y > view.y && guide.bottom < view.bottom;
    })).toBe(true);
    await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Отменить съёмку", exact: true })).toBeInViewport();
    await dialog.locator(".passport-camera-view").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/passport-camera-${width}.png` });
  }
  await dialog.getByRole("button", { name: "Сделать снимок", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Обрезка и выравнивание", exact: true })).toBeVisible();
  await expect(dialog.locator(".passport-crop-handle")).toHaveCount(4);
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await dialog.getByRole("button", { name: "Использовать фото", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Сканирование паспорта", exact: true })).toBeVisible();
  const preview = dialog.getByRole("img", { name: "Фото и личные данные", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  expect(await preview.evaluate(element => (element as HTMLImageElement).naturalWidth > (element as HTMLImageElement).naturalHeight)).toBe(true);
  expect(await counters(page)).toEqual({ calls: 1, stopped: 1 });
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(1);
  expect(writes).toEqual([]); expect(external).toEqual([]);
  expect(await (await page.request.get("/api/v1/profile")).json()).toEqual(before);
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".passport-photo-preview")).toHaveCount(0);
  await context.close();
});

test("live fields need corroboration, clear on motion/poor light and do not persist pixels", async ({ browser }) => {
  const context = await actor(browser, 76004, "+79997006004"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url()); });
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.mode = "sharp"; });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Основные поля читаются — можно снимать", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.reads)).toBeGreaterThanOrEqual(2);
  await expect(dialog.locator(".passport-live-zone.is-stable")).toHaveCount(4);
  await page.screenshot({ path: "test-results/passport-live-fields.png" });
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.mode = "dark"; });
  await expect(dialog.locator(".passport-live-zone")).toHaveCount(0);
  await expect(dialog.getByText("Основные поля читаются — можно снимать", { exact: true })).toHaveCount(0);
  await page.evaluate(() => { const state = (window as unknown as TestWindow).cameraTest; state.mode = "sharp"; state.weak = true; });
  await expect(dialog.getByRole("status")).toContainText("Света достаточно");
  const previousReads = await page.evaluate(() => (window as unknown as TestWindow).cameraTest.reads);
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).cameraTest.reads)).toBeGreaterThan(previousReads + 1);
  await expect(dialog.locator(".passport-live-zone")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  expect(await counters(page)).toEqual({ calls: 1, stopped: 1 });
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(1);
  expect(writes).toEqual([]);
  await context.close();
});

test("camera remains usable when the local OCR worker hangs and terminates on close", async ({ browser }) => {
  const context = await actor(browser, 76005, "+79997006005"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  await page.evaluate(() => { const state = (window as unknown as TestWindow).cameraTest; state.mode = "sharp"; state.ocrDelay = 30_000; });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Подсветка пока недоступна", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(1);
  await dialog.getByRole("button", { name: "Отменить съёмку", exact: true }).click();
  expect(await counters(page)).toEqual({ calls: 1, stopped: 1 });
  await context.close();
});

test("real WASM live OCR recognizes invented camera text locally and closes its worker", async ({ browser }) => {
  const context = await actor(browser, 76006, "+79997006006"); await cameraMock(context, false);
  const page = await context.newPage(); await openScanner(page);
  const writes: string[] = [], external: string[] = []; let terminated = 0;
  context.on("request", request => { if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url()); if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== "http://127.0.0.1:4300") external.push(request.url()); });
  page.on("worker", worker => worker.on("close", () => terminated++));
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.mode = "document"; });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Основные поля читаются — можно снимать", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(dialog.locator(".passport-live-zone.is-stable")).toHaveCount(4);
  await page.screenshot({ path: "test-results/passport-live-real-ocr.png" });
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await expect.poll(() => terminated).toBe(1);
  expect(writes).toEqual([]); expect(external).toEqual([]);
  expect(await counters(page)).toEqual({ calls: 1, stopped: 1 });
  await context.close();
});

test("passport camera stops on cancel, modal close, hidden page and late permission grant", async ({ browser }) => {
  const context = await actor(browser, 76002, "+79997006002"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Снять: Регистрация", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  const guide = (await dialog.locator(".passport-camera-guide").boundingBox())!;
  expect(guide.height).toBeGreaterThan(guide.width);
  await dialog.getByRole("button", { name: "Отменить съёмку", exact: true }).click();
  await expect.poll(() => counters(page)).toEqual({ calls: 1, stopped: 1 });
  await page.getByRole("button", { name: "Снять: Регистрация", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await expect.poll(() => counters(page)).toEqual({ calls: 2, stopped: 2 });
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  await page.getByRole("button", { name: "Снять: Регистрация", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(dialog.getByRole("alert")).toContainText("Съёмка приостановлена");
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeDisabled();
  expect(await counters(page)).toEqual({ calls: 3, stopped: 3 });
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); (window as unknown as TestWindow).cameraTest.pending = true; });
  await dialog.getByRole("button", { name: "Отменить съёмку", exact: true }).click();
  await page.getByRole("button", { name: "Снять: Регистрация", exact: true }).click();
  await expect.poll(() => counters(page)).toEqual({ calls: 4, stopped: 3 });
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await page.evaluate(() => (window as unknown as TestWindow).cameraTest.release?.());
  await expect.poll(() => counters(page)).toEqual({ calls: 4, stopped: 4 });
  await context.close();
});

test("passport camera denial provides native capture and keeps ordinary upload available", async ({ browser }) => {
  const context = await actor(browser, 76003, "+79997006003"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.deny = true; });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Не удалось открыть камеру");
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Снять системной камерой", { exact: true })).toHaveAttribute("capture", "environment");
  await dialog.getByRole("button", { name: "Отменить съёмку", exact: true }).click();
  await expect(dialog.getByLabel("Фото: Фото и личные данные", { exact: true })).toBeEnabled();
  await page.evaluate(() => { Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: undefined }); });
  await page.getByRole("button", { name: "Снять: Регистрация", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось открыть камеру");
  await expect(dialog.getByLabel("Снять системной камерой", { exact: true })).toHaveAttribute("capture", "environment");
  expect(await counters(page)).toEqual({ calls: 1, stopped: 0 });
  await context.close();
});
