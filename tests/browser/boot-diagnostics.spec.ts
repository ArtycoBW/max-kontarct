import { expect, test, type Page } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { BOOT_EXPIRES_AT, BOOT_PARAMETER, BOOT_PATH, parseBootEvent, type BootEvent } from "../../apps/web/lib/diagnostics/boot-schema";

const sdkUrl = "https://st.max.ru/js/max-web-app.js";
const probeUrl = `/?WebAppStartParam=${BOOT_PARAMETER}`;
const sdk = 'window.WebApp={initData:"",ready(){}};';

async function observe(page: Page) {
  const events: BootEvent[] = [];
  const statuses: number[] = [];
  await page.route("**/api/**", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Synthetic API unavailable"}' }));
  page.on("request", request => {
    if (new URL(request.url()).pathname !== BOOT_PATH || request.method() !== "POST") return;
    const event = parseBootEvent(request.postDataJSON());
    expect(event).not.toBeNull();
    expect(request.headers().cookie).toBeUndefined();
    expect(request.headers().referer).toBeUndefined();
    events.push(event!);
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname === BOOT_PATH && response.request().method() === "POST") statuses.push(response.status());
  });
  return { events, statuses };
}

test("normal launches do not collect startup diagnostics", async ({ page }) => {
  const { events } = await observe(page);
  await page.route(sdkUrl, route => route.fulfill({ contentType: "application/javascript", body: sdk }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Начать работу с Макс-Контракт" })).toBeVisible();
  expect(await page.locator("#max-boot-diagnostic").count()).toBe(0);
  expect(await page.evaluate(() => "__maxBootDiagnostic" in window)).toBe(false);
  expect(events).toEqual([]);
});

test("opt-in reports startup and auth categories with no cookies, referrer or private error text", async ({ page }) => {
  test.skip(Date.now() >= BOOT_EXPIRES_AT, "Temporary probe has expired");
  const { events, statuses } = await observe(page);
  await page.context().addCookies([{ name: "synthetic-session", value: "PRIVATE_COOKIE", url: "http://127.0.0.1:4300" }]);
  await page.route(sdkUrl, route => route.fulfill({ contentType: "application/javascript", body: sdk }));
  await page.goto(`${probeUrl}#PRIVATE_FRAGMENT`);
  await expect.poll(() => events.map(event => event.stage)).toEqual(expect.arrayContaining(["document-start", "react-mounted", "sdk-loaded", "sdk-ready", "ready-called", "dom-ready", "page-load"]));
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await expect.poll(() => events.some(event => event.stage === "auth-error" && event.detail === "server-error")).toBe(true);
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("PRIVATE_PASSPORT"), message: "PRIVATE_TOKEN", filename: "https://example.test/PRIVATE_URL" }));
  });
  await expect.poll(() => events.some(event => event.stage === "js-error" && event.detail === "TypeError")).toBe(true);
  await expect.poll(() => statuses.length - events.length).toBe(0);
  expect(statuses.every(status => status === 204)).toBe(true);
  expect(JSON.stringify(events)).not.toContain("PRIVATE");
  expect(new Set(events.map(event => event.run)).size).toBe(1);
  expect(events.every(event => event.context === "standalone")).toBe(true);
});

test("the early probe runs while the application JavaScript is unavailable", async ({ page }) => {
  test.skip(Date.now() >= BOOT_EXPIRES_AT, "Temporary probe has expired");
  const { events } = await observe(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/**/*.js", async route => { await gate; await route.abort(); });
  try {
    await page.goto(probeUrl, { waitUntil: "commit" });
    await expect.poll(() => events.map(event => event.stage)).toContain("document-start");
    expect(events.some(event => event.stage === "react-mounted")).toBe(false);
    expect(await page.locator("#max-boot-diagnostic").count()).toBe(1);
  } finally { release(); }
});

test("the probe works in an isolated cross-origin miniapp frame", async ({ page }) => {
  test.skip(Date.now() >= BOOT_EXPIRES_AT, "Temporary probe has expired");
  const { events, statuses } = await observe(page);
  await page.route(sdkUrl, route => route.fulfill({ contentType: "application/javascript", body: sdk }));
  // A real loopback parent keeps Chromium's local-network protection enabled.
  // An intercepted fictional public parent is blocked before the child loads.
  const parent = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<iframe credentialless sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-storage-access-by-user-activation allow-downloads" referrerpolicy="strict-origin" src="http://127.0.0.1:4300${probeUrl}"></iframe>`);
  });
  await new Promise<void>(resolve => parent.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(`http://127.0.0.1:${(parent.address() as AddressInfo).port}/`);
    await expect.poll(() => events.some(event => event.stage === "ready-called")).toBe(true);
    await expect.poll(() => statuses.length - events.length).toBe(0);
    expect(statuses.every(status => status === 204)).toBe(true);
    expect(events.every(event => event.context === "embedded")).toBe(true);
  } finally {
    parent.closeAllConnections();
    await new Promise<void>(resolve => parent.close(() => resolve()));
  }
});

test("a pending SDK can be distinguished from missing document or React startup", async ({ page }) => {
  test.skip(Date.now() >= BOOT_EXPIRES_AT, "Temporary probe has expired");
  const { events } = await observe(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(sdkUrl, async route => { await gate; await route.abort(); });
  try {
    await page.goto(probeUrl, { waitUntil: "domcontentloaded" });
    await expect.poll(() => events.some(event => event.stage === "react-mounted")).toBe(true);
    await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
    await expect.poll(() => events.some(event => event.stage === "bridge-timeout")).toBe(true);
    expect(events.some(event => event.stage === "document-start")).toBe(true);
    expect(events.some(event => event.stage === "ready-called" || event.stage === "sdk-ready")).toBe(false);
  } finally { release(); }
});

test("probe query on a public verification route does not enable collection", async ({ page }) => {
  const { events } = await observe(page);
  await page.goto(`/verify/startup-test?WebAppStartParam=${BOOT_PARAMETER}`);
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  expect(await page.locator("#max-boot-diagnostic").count()).toBe(0);
  expect(events).toEqual([]);
});

test("diagnostic results cannot be read publicly and invalid payloads are rejected", async ({ request }) => {
  expect((await request.get(BOOT_PATH)).status()).toBe(404);
  const response = await request.post(BOOT_PATH, {
    headers: { origin: "http://127.0.0.1:4300", "content-type": "text/plain" },
    data: JSON.stringify({ secret: "PRIVATE_REJECTED" }),
  });
  expect(response.status()).toBe(Date.now() >= BOOT_EXPIRES_AT ? 404 : 400);
  expect(await response.text()).toBe("");
});
