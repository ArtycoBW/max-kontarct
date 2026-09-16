import { expect, test, type Page } from "@playwright/test";

// Entirely local fixtures; no real MAX, passport data, API or database writes.
async function mockApp(page: Page) {
  const writes: string[] = [];
  await page.route("https://st.max.ru/js/max-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: "window.WebApp={initData:'layout-test',initDataUnsafe:{},ready(){},expand(){}}" }));
  await page.route("**/api/v1/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!["GET", "HEAD"].includes(route.request().method())) writes.push(pathname);
    if (pathname === "/api/v1/auth/me") return route.fulfill({ json: { user: { id: "local-layout-test", role: "USER", maxAccount: { firstName: "Тест", lastName: "Пользователь", maxUserId: "local-test", username: null, languageCode: "ru" } } } });
    if (pathname === "/api/v1/onboarding") return route.fulfill({ json: { completed: true, phoneVerified: true, requiredConsentsAccepted: true, consents: [], phone: { e164: "+79990000000", source: "MAX", verifiedAt: "2026-01-01T00:00:00Z" } } });
    if (pathname === "/api/v1/profile") return route.fulfill({ json: { firstName: "", lastName: "", middleName: null, birthDate: null, address: null, passport: null, phone: null, email: null, maxUsername: null, updatedAt: null } });
    if (pathname === "/api/v1/deals") return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { message: "Unexpected mocked request" } });
  });
  const authenticated = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/auth/me");
  await page.goto("/");
  await authenticated;
  return writes;
}

for (const width of [320, 390, 1440]) {
  test(`photographic start keeps all four stages in normal flow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApp(page);
    const steps = page.getByRole("list", { name: "Этапы оформления договора" }).getByRole("listitem");
    await expect(steps).toHaveCount(4);
    await expect(page.locator(".start-screen-sequence, .start-screen-chapters, .start-overview-number, .start-screen-progress, canvas")).toHaveCount(0);
    await expect(page.locator(".start-story button")).toHaveCount(1);
    const positions = await steps.evaluateAll(elements => elements.map(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })));
    for (let i = 1; i < positions.length; i++) expect(positions[i]!.top).toBeGreaterThan(positions[i - 1]!.bottom);
    const action = page.getByRole("button", { name: "Начать работу с Макс-Контракт" });
    expect((await action.boundingBox())!.y).toBeGreaterThan(positions[3]!.bottom);
    for (let i = 0; i < 4; i++) {
      const step = steps.nth(i);
      await step.scrollIntoViewIfNeeded();
      await expect(step.getByRole("heading")).toBeInViewport();
      await expect.poll(() => step.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    await page.locator(".start-screen-scroll").evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/start-restored-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await action.click();
    await expect(page.getByRole("navigation", { name: "Навигация приложения" })).toBeVisible();
  });

  test(`copied document preview and transfer remain local at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await mockApp(page);
    await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Вставить из Цифрового ID / Госуслуг" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const input = dialog.getByLabel("Скопированный текст");
    await input.fill("Серия и номер: 1234 567890\nКем выдан: ОТДЕЛ МВД ПО ПРИМЕРНОМУ РАЙОНУ\nДата выдачи: 15.05.2020\nКод подразделения: 123-456\nФИО: Примеров Иван Петрович\nПол: Мужской\nДата рождения: 12.04.1995\nМесто рождения: ГОР. Казань");
    await expect(dialog.getByRole("status")).toHaveText("Готово к переносу полей: 11");
    await expect(dialog.locator(".pasted-details-preview > div")).toHaveCount(11);
    expect(writes).toEqual([]);
    await dialog.locator(".app-modal-body").evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/pasted-details-${width}.png` });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Перенести в форму" }).click();
    await expect(page.getByLabel("Фамилия", { exact: true })).toHaveValue("Примеров");
    await expect(page.getByLabel("Имя", { exact: true })).toHaveValue("Иван");
    await expect(page.getByLabel("Серия паспорта", { exact: true })).toHaveValue("1234");
    await expect(page.getByLabel("Номер паспорта", { exact: true })).toHaveValue("567890");
    expect(writes).toEqual([]);
    await trigger.click();
    await expect(input).toHaveValue("");
    await input.fill("Имя: Иван\nИмя: Пётр");
    await expect(dialog.getByRole("button", { name: "Перенести в форму" })).toBeDisabled();
    await expect(dialog).toContainText("Не перенесём поля");
    await page.keyboard.press("Escape");
    await trigger.click();
    await expect(input).toHaveValue("");
  });
}
