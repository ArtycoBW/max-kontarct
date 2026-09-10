import { expect, test, type Page } from "@playwright/test";

const sdkUrl = "https://st.max.ru/js/max-web-app.js";
const bridgeScript = `
  window.WebApp = {
    initData: "",
    ready() {
      window.dispatchEvent(new Event("test:max-ready"));
    }
  };
`;

async function observeReady(page: Page) {
  await page.addInitScript(() => {
    const events: boolean[] = [];
    Object.assign(window, { maxReadyEvents: events });
    window.addEventListener("test:max-ready", () => {
      events.push(document.querySelector("main") !== null);
    });
  });
  // Startup readiness must not depend on a working API or authenticated user.
  await page.route("**/api/**", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ message: "Test API unavailable" }),
  }));
}

async function readyEvents(page: Page) {
  return page.evaluate(() => (window as Window & { maxReadyEvents: boolean[] }).maxReadyEvents);
}

test("MAX receives ready after UI mount even when authentication fails", async ({ page }) => {
  await observeReady(page);
  await page.route(sdkUrl, (route) => route.fulfill({ contentType: "application/javascript", body: bridgeScript }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Начать работу с Макс-Контракт" })).toBeVisible();
  await expect.poll(() => readyEvents(page)).toEqual([true]);
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await expect(page.getByRole("button", { name: "Повторить", exact: true })).toBeVisible();
  expect(await readyEvents(page)).toEqual([true]);
});

test("a delayed SDK announces ready without waiting for successful authentication", async ({ page }) => {
  await observeReady(page);
  let releaseSdk!: () => void;
  const sdkGate = new Promise<void>((resolve) => { releaseSdk = resolve; });
  await page.route(sdkUrl, async (route) => {
    await sdkGate;
    await route.fulfill({ contentType: "application/javascript", body: bridgeScript });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  // Let the auth bridge-discovery timeout expire before the SDK arrives.
  await expect(page.getByRole("button", { name: "Повторить", exact: true })).toBeVisible();
  expect(await readyEvents(page)).toEqual([]);
  releaseSdk();
  await expect.poll(() => readyEvents(page)).toEqual([true]);
});

test("preloaded bridge and Script onReady do not send duplicate ready events", async ({ page }) => {
  await observeReady(page);
  await page.addInitScript({ content: bridgeScript });
  await page.route(sdkUrl, (route) => route.fulfill({ contentType: "application/javascript", body: "/* already injected by host */" }));
  await page.goto("/");
  await expect.poll(() => readyEvents(page)).toEqual([true]);
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await expect(page.getByRole("button", { name: "Повторить", exact: true })).toBeVisible();
  expect(await readyEvents(page)).toEqual([true]);
});

test("unavailable public verification links still do not load the MAX SDK", async ({ page }) => {
  let sdkRequests = 0;
  await observeReady(page);
  await page.route(sdkUrl, (route) => {
    sdkRequests += 1;
    return route.fulfill({ contentType: "application/javascript", body: bridgeScript });
  });
  await page.goto("/verify/startup-test");
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(sdkRequests).toBe(0);
  expect(await readyEvents(page)).toEqual([]);
});
