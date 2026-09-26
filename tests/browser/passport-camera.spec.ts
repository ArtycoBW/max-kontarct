import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

type CameraState = {
  calls: MediaStreamConstraints[]; stopped: number; mode: "dark" | "glare" | "sharp" | "document";
  deny: boolean; pending: boolean; release?: () => void;
  workerStopped: number; reads: number; ocrDelay: number; weak: boolean; activeWorkers: number; maxWorkers: number;
};
type TestWindow = Window & { cameraTest: CameraState };
test.beforeEach(async ({ page }, info) => {
  const syntheticCameraSupported = await page.evaluate(() => typeof document.createElement("canvas").captureStream === "function");
  test.skip(!syntheticCameraSupported && !info.title.includes("denial"), "This browser port has no canvas.captureStream for the synthetic camera; real-device camera verification is separate");
});
async function cameraMock(context: BrowserContext, stubOcr = true) {
  await context.addInitScript((stubOcr: boolean) => {
    const state = (window as unknown as TestWindow).cameraTest = { calls: [], stopped: 0, mode: "dark", deny: false, pending: false, workerStopped: 0, reads: 0, ocrDelay: 80, weak: false, activeWorkers: 0, maxWorkers: 0 };
    // Deterministic OCR for camera lifecycle/post-capture tests. Real WASM is covered separately.
    if (stubOcr) Object.defineProperty(window, "Worker", { configurable: true, value: class {
      onmessage?: (message: { data: unknown }) => void;
      ended = false;
      constructor() { state.activeWorkers++; state.maxWorkers = Math.max(state.maxWorkers, state.activeWorkers); }
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
        setTimeout(() => { if (!this.ended) this.onmessage?.({ data: { jobId: message.jobId, status: "resolve", data: recognizing ? { text: rows.join("\n"), confidence: 95, blocks: [{ paragraphs: [{ lines }] }] } : {} } }); }, recognizing ? state.ocrDelay : 0);
      }
      terminate() { if (!this.ended) { state.workerStopped++; state.activeWorkers--; } this.ended = true; }
    } });
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
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
  await page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот", exact: true }).click();
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
  await expect(dialog.locator(".passport-live-panel, .passport-live-zone, .passport-camera-quality")).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: "Автоснимок" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.reads)).toBe(0);
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
  const result = dialog.getByRole("region", { name: "Результат фото: Фото и личные данные", exact: true });
  await expect(result).toContainText("мало света");
  await expect(result).toContainText("Прочитано 4 из 8 полей", { timeout: 30_000 });
  await expect(result).toContainText("целиком видна на фото");
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(1);
  expect(writes).toEqual([]); expect(external).toEqual([]);
  expect(await (await page.request.get("/api/v1/profile")).json()).toEqual(before);
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".passport-photo-preview")).toHaveCount(0);
  await context.close();
});

test("camera stays quiet and usable without loading OCR even when recognition would hang", async ({ browser }) => {
  const context = await actor(browser, 76004, "+79997006004"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.ocrDelay = 30_000; });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const mode of ["dark", "glare", "sharp"] as const) {
    await page.evaluate(mode => { (window as unknown as TestWindow).cameraTest.mode = mode; }, mode);
    await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
    await expect(dialog).not.toContainText(/задержите|Темно:|Возможен блик:|Наведите камеру|Читается|Не найдено/);
    expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.reads)).toBe(0);
  }
  await dialog.getByRole("button", { name: "Сделать снимок", exact: true }).click();
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await dialog.getByRole("button", { name: "Использовать фото", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).cameraTest.reads)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Отменить распознавание", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Продолжить проверку", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(1);
  await dialog.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  expect(await counters(page)).toEqual({ calls: 2, stopped: 2 });
  await context.close();
});

test("photo checks queue one worker, retain other results and invalidate replaced or cropped photos", async ({ browser }) => {
  const context = await actor(browser, 76007, "+79997006007"); await cameraMock(context);
  const page = await context.newPage(); await openScanner(page);
  const dialog = page.getByRole("dialog");
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#ddd"; ctx.fillRect(0, 0, 800, 600);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const file = { name: "invented-only.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
  const identity = dialog.getByRole("region", { name: "Результат фото: Фото и личные данные", exact: true });
  const issuance = dialog.getByRole("region", { name: "Результат фото: Кем выдан паспорт", exact: true });
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.ocrDelay = 500; });
  await dialog.getByLabel("Фото: Кем выдан паспорт", { exact: true }).setInputFiles(file);
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles(file);
  await expect(issuance).toContainText("Прочитано 1 из 5 полей");
  await expect(identity).toContainText("Прочитано 4 из 8 полей");
  const completed = await page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped);
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.maxWorkers)).toBe(1);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow(page);
    await identity.evaluate(element => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `test-results/passport-photo-feedback-${width}.png` });
  }
  // Opening and cancelling an editor must keep the completed check, not rerun it.
  await dialog.getByRole("button", { name: "Редактировать: Фото и личные данные", exact: true }).click();
  await dialog.getByRole("button", { name: "Отменить редактирование", exact: true }).click();
  await expect(identity).toContainText("Прочитано 4 из 8 полей");
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(completed);
  // Applying a crop creates new pixels and requires a new check only for that page.
  await dialog.getByRole("button", { name: "Редактировать: Фото и личные данные", exact: true }).click();
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await dialog.getByRole("button", { name: "Использовать фото", exact: true }).click();
  await expect(identity).not.toContainText("Прочитано 4 из 8 полей");
  await expect(issuance).toContainText("Прочитано 1 из 5 полей");
  await expect(identity).toContainText("Прочитано 4 из 8 полей");
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.workerStopped)).toBe(completed + 1);
  // A replacement with unreadable OCR must not retain earlier filled fields.
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.weak = true; });
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles({ ...file, name: "replacement.png" });
  await expect(identity).not.toContainText("Прочитано 4 из 8 полей");
  await expect(identity).toContainText("Прочитано 0 из 8 полей");
  await dialog.getByRole("button", { name: "Проверить данные", exact: true }).click();
  await expect(dialog.getByLabel("Фамилия", { exact: true })).toBeEmpty();
  await expect(dialog.getByLabel("Имя", { exact: true })).toBeEmpty();
  await dialog.getByRole("button", { name: "Выбрать другие фотографии", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить: Фото и личные данные", exact: true }).click();
  await expect(identity).toHaveCount(0); await expect(issuance).toContainText("Прочитано 1 из 5 полей");
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  expect(await page.evaluate(() => (window as unknown as TestWindow).cameraTest.activeWorkers)).toBe(0);
  await context.close();
});

test("real WASM checks the captured photo locally and closes its worker", async ({ browser }) => {
  const context = await actor(browser, 76006, "+79997006006"); await cameraMock(context, false);
  const page = await context.newPage(); await openScanner(page);
  const writes: string[] = [], external: string[] = []; let terminated = 0;
  context.on("request", request => { if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url()); if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== "http://127.0.0.1:4300") external.push(request.url()); });
  page.on("worker", worker => worker.on("close", () => terminated++));
  await page.evaluate(() => { (window as unknown as TestWindow).cameraTest.mode = "document"; });
  await page.getByRole("button", { name: "Снять: Фото и личные данные", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Сделать снимок", exact: true }).click();
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await dialog.getByRole("button", { name: "Использовать фото", exact: true }).click();
  await expect(dialog.locator(".passport-photo-result")).toContainText(/Прочитано [4-8] из 8 полей/, { timeout: 160_000 });
  await dialog.getByRole("button", { name: "Проверить данные", exact: true }).click();
  await expect(dialog.getByLabel("Фамилия", { exact: true })).toHaveValue("Примеров");
  await expect(dialog.getByLabel("Имя", { exact: true })).toHaveValue("Иван");
  await page.screenshot({ path: "test-results/passport-captured-real-ocr.png" });
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await expect.poll(() => terminated).toBe(1);
  expect(writes).toEqual([]); expect(external).toEqual([]);
  expect(await counters(page)).toEqual({ calls: 1, stopped: 1 });
  await context.close();
});

test("real WASM reads a complete perpendicular red number from an invented page", async ({ browser }) => {
  const context = await actor(browser, 76008, "+79997006008");
  const page = await context.newPage(); await openScanner(page);
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1500; canvas.height = 1100;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#ebe1d5"; ctx.fillRect(0, 0, 1500, 1100);
    ctx.fillStyle = "#111"; ctx.font = "bold 40px Arial";
    ["ФАМИЛИЯ ПРИМЕРОВ", "ИМЯ ИВАН", "ОТЧЕСТВО ИВАНОВИЧ", "ДАТА РОЖДЕНИЯ 01.02.1990", "МУЖ.", "МЕСТО РОЖДЕНИЯ Г. ПРИМЕР"].forEach((row, i) => ctx.fillText(row, 120, 170 + i * 110));
    ctx.save(); ctx.translate(1350, 160); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "#90364c"; ctx.font = "bold 40px monospace"; ctx.fillText("00 00 123456", 0, 0); ctx.restore();
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles({ name: "invented-number.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
  await dialog.getByRole("button", { name: "Проверить данные", exact: true }).click({ timeout: 180_000 });
  await expect(dialog.getByLabel("Серия паспорта", { exact: true })).toHaveValue("0000");
  await expect(dialog.getByLabel("Номер паспорта", { exact: true })).toHaveValue("123456");
  await dialog.getByRole("button", { name: "Закрыть окно" }).click(); await context.close();
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
  await page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот", exact: true }).click();
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
