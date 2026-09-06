import { test, expect, type Page } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

async function checkBottomGap(page: Page, buttonName: string) {
  const button = page.getByRole("button", { name: buttonName, exact: true });
  // Wait for the new screen, then scroll it (the previous screen may still be exiting).
  await expect(button).toBeVisible();
  await expect.poll(async () => {
    await page.locator(".mini-app-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
    return button.evaluate(element =>
      element.closest(".mini-app-scroll")!.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom);
  }).toBeGreaterThanOrEqual(20);
  await noOverflow(page);
}

test("short and long deal lists, profile and documents keep space above navigation", async ({ browser }) => {
  const context = await actor(browser, 71101, "+79997001101");
  const page = await context.newPage();
  await page.goto("/");
  await onboarding(page);
  for (const count of [1, 12]) {
    await page.route("**/api/v1/deals", route => route.fulfill({ json: {
      total: count,
      items: Array.from({ length: count }, (_, index) => ({
        id: `layout-${index}`, title: `Проверка отступов ${index + 1}`, templateTitle: "Аренда имущества",
        status: "DRAFT", versionNumber: 1, updatedAt: new Date().toISOString(),
      })),
    } }));
    await page.getByRole("button", { name: "Сделки", exact: true }).click();
    await expect(page.locator(".deal-list-card")).toHaveCount(count);
    for (const [width, height] of [[320, 320], [390, 844], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await checkBottomGap(page, "Создать ещё сделку");
      await page.screenshot({ path: `test-results/deals-${count}-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Документы", exact: true }).click();
    await expect(page.locator(".document-deal-list > button")).toHaveCount(count);
    await page.locator(".mini-app-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await page.locator(".security-note").evaluate(element =>
      element.closest(".mini-app-scroll")!.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(20);
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    await checkBottomGap(page, "Сохранить профиль");
    await page.screenshot({ path: `test-results/profile-bottom-${count}.png`, fullPage: true });
    await page.unroute("**/api/v1/deals");
  }
  await context.close();
});
