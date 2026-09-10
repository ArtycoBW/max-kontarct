import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

type CameraState = {
  calls: MediaStreamConstraints[]; stopped: number; mode: "dark" | "glare" | "sharp";
  deny: boolean; pending: boolean; release?: () => void;
};
type TestWindow = Window & { cameraTest: CameraState };
async function cameraMock(context: BrowserContext) {
  await context.addInitScript(() => {
    const state = (window as unknown as TestWindow).cameraTest = { calls: [], stopped: 0, mode: "dark", deny: false, pending: false };
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
      };
      draw(); const timer = setInterval(draw, 100);
      const stream = canvas.captureStream(10);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { state.stopped++; clearInterval(timer); stop(); canvas.width = 0; canvas.height = 0; };
      }
      return stream;
    } });
  });
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
    const view = (await dialog.locator(".passport-camera-view").boundingBox())!, guide = (await dialog.locator(".passport-camera-guide").boundingBox())!;
    expect(guide.width).toBeGreaterThan(guide.height);
    expect(Math.abs(guide.width / guide.height - 125 / 88)).toBeLessThan(.02);
    expect(guide.x).toBeGreaterThan(view.x); expect(guide.x + guide.width).toBeLessThan(view.x + view.width);
    expect(guide.y).toBeGreaterThan(view.y); expect(guide.y + guide.height).toBeLessThan(view.y + view.height);
    await expect(dialog.getByRole("button", { name: "Сделать снимок", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Отменить съёмку", exact: true })).toBeInViewport();
    await dialog.locator(".passport-camera-view").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/passport-camera-${width}.png` });
  }
  await dialog.getByRole("button", { name: "Сделать снимок", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Сканирование паспорта", exact: true })).toBeVisible();
  const preview = dialog.getByRole("img", { name: "Фото и личные данные", exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  expect(await preview.evaluate(element => (element as HTMLImageElement).naturalWidth > (element as HTMLImageElement).naturalHeight)).toBe(true);
  expect(await counters(page)).toEqual({ calls: 1, stopped: 1 });
  expect(writes).toEqual([]); expect(external).toEqual([]);
  expect(await (await page.request.get("/api/v1/profile")).json()).toEqual(before);
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".passport-photo-preview")).toHaveCount(0);
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
