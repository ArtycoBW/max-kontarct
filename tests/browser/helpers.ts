import { createHmac, randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";

export const testBotToken = "browser-test-bot-token";
export function maxProof(id: number, ageSeconds = 0) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - ageSeconds), query_id: randomUUID(), user: JSON.stringify({ id, first_name: "Тест", last_name: `Участник${id}`, language_code: "ru" }) });
  const text = [...params].sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, value]) => `${key}=${value}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(testBotToken).digest();
  params.set("hash", createHmac("sha256", key).update(text).digest("hex"));
  return params.toString();
}
export async function actor(browser: Browser, id: number, phone: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: "http://127.0.0.1:4300", reducedMotion: "reduce" });
  await context.route("https://st.max.ru/js/max-web-app.js", async (route) => {
    const authDate = String(Date.now());
    const hash = createHmac("sha256", testBotToken).update(`authDate=${authDate}\nphone=${phone.replace("+", "")}\nuserId=${id}`).digest("hex");
    const contact = { authDate, hash, phone };
    await route.fulfill({ contentType: "application/javascript", body: `window.WebApp={initData:${JSON.stringify(maxProof(id))},initDataUnsafe:{},ready(){},expand(){},requestContact:async()=>(${JSON.stringify(contact)})};` });
  });
  await context.route("https://max.ru/browser_test_bot**", async (route) => {
    const payload = new URL(route.request().url()).searchParams.get("startapp") || "";
    await route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:4300/?WebAppStartParam=${encodeURIComponent(payload)}` } });
  });
  return context;
}
export async function onboarding(page: Page, landing = true) {
  if (landing) await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("switch", { name: "Обработка персональных данных" }).check();
  await page.getByRole("switch", { name: "Условия использования" }).check();
  await page.getByRole("button", { name: "Принять и продолжить" }).click();
  await page.getByRole("button", { name: "Подтвердить через MAX" }).click();
  await expect(page.getByRole("heading", { name: "Ваш номер телефона" })).toHaveCount(0);
}
export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

export async function futureDate(page: Page, label: string, day: number) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("combobox", { name: "Год", exact: true }).click();
  await page.getByRole("option", { name: String(new Date().getFullYear() + 1), exact: true }).click();
  await page.getByRole("combobox", { name: "Месяц", exact: true }).click();
  await page.getByRole("option", { name: "Январь", exact: true }).click();
  await page.locator(".calendar-day:not(.is-outside) .calendar-day-button").filter({ hasText: new RegExp(`^${day}$`) }).click();
}
