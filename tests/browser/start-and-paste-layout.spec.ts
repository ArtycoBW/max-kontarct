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

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`single welcome screen fits without scrolling at ${width}px`, async ({ page }) => {
    await mockApp(page);
    const steps = page.getByRole("list", { name: "Этапы оформления договора" }).getByRole("listitem");
    await expect(steps).toHaveCount(3);
    await expect(page.locator("canvas, .start-screen-scroll")).toHaveCount(0);
    const action = page.getByRole("button", { name: "Начать работу с Макс-Контракт" });
    for (const size of [{ width, height: 844 }, { width, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      for (const step of await steps.all()) await expect(step).toBeInViewport({ ratio: 1 });
      await expect(action).toBeInViewport({ ratio: 1 });
      expect(await page.locator(".start-welcome").evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/welcome-${size.width}-${size.height}.png` });
    }
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

test("reduced motion keeps a poster and all stages without fetching the sequence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frames: string[] = [];
  page.on("request", request => { if (request.url().includes("/images/start-screen/") && request.resourceType() === "fetch") frames.push(request.url()); });
  await mockApp(page);
  await expect(page.locator(".start-story-canvas")).toBeHidden();
  await expect(page.locator(".welcome-steps li")).toHaveCount(3);
  expect(await page.locator(".welcome-photo").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  expect(frames).toEqual([]);
});

test("failed frame downloads retain the poster and do not block reading or starting", async ({ page }) => {
  await page.route("**/images/start-screen/*.webp", route => route.abort());
  await mockApp(page);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".welcome-steps li")).toHaveCount(3);
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await expect(page.getByRole("navigation", { name: "Навигация приложения" })).toBeVisible();
});

test("empty and populated deal lists keep the bottom action and distinguish statuses", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await mockApp(page);
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: "Сделки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Пока нет сделок" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать сделку", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/deals-empty.png" });
  await page.route("**/api/v1/deals", route => route.fulfill({ json: { items: ["DRAFT", "COMPLETED"].map((status, i) => ({
    id: `test-${i}`, title: "Купля-продажа имущества", templateTitle: "Купля-продажа", status,
    counterpartyLastName: "Примеров", versionNumber: 1, updatedAt: "2026-09-26T12:00:00Z",
  })) } }));
  await expect(page.locator(".deal-list-card")).toHaveCount(2);
  await expect(page.locator(".deal-counterparty").first()).toHaveText("С кем: Примеров");
  await expect(page.locator('[data-status="DRAFT"]')).toHaveCSS("background-color", "rgb(246, 246, 246)");
  await expect(page.locator('[data-status="COMPLETED"]')).toHaveCSS("background-color", "rgb(239, 250, 244)");
  await expect(page.getByRole("button", { name: "Создать новую сделку", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/deals-statuses.png" });
});

test("description leads to three requisites methods; import is reviewed before explicit saving", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await mockApp(page);
  const template = { id: "template", slug: "movable-property-sale", title: "Купля-продажа имущества", summary: "Передача имущества", isDemo: false,
    currentVersion: { id: "template-version", versionNumber: 1, documentRequirements: [], questionnaireSchema: { type: "object", properties: { price: { type: "number", title: "Цена" } } } } };
  let draft = { id: "draft", status: "DRAFT", title: "Продажа стола", updatedAt: "2026-09-26T12:00:00Z", createdAt: "2026-09-26T12:00:00Z", versionId: "version", versionNumber: 1,
    template: { slug: template.slug, title: template.title, versionId: "template-version", versionNumber: 1 }, contractDraft: null, sourceGenerationId: null,
    draft: { answers: {}, creationPath: "AI_ASSISTED", currentStep: "DESCRIPTION", description: "Продам стол за 1000 рублей", clarificationSessionId: null, subjectDocumentsParty: null } };
  let profileWrites = 0;
  await page.route("**/api/v1/templates**", route => route.fulfill({ json: route.request().url().endsWith("/templates") ? { items: [template] } : template }));
  await page.route("**/api/v1/deal-intake", route => route.fulfill({ json: { template, mode: "TEMPLATE", description: draft.draft.description, title: draft.title, reason: "Определена продажа", answers: { price: 1000 }, warnings: [] } }));
  await page.route("**/api/v1/deals", route => route.request().method() === "POST" ? route.fulfill({ json: draft }) : route.fallback());
  await page.route(/\/api\/v1\/deals\/draft(?:\/draft)?$/, route => {
    if (route.request().method() === "PATCH") draft = { ...draft, draft: { ...draft.draft, ...route.request().postDataJSON() } };
    return route.fulfill({ json: draft });
  });
  await page.route("**/api/v1/deals/draft/workspace", route => route.fulfill({ json: { counterparty: null, invitation: null } }));
  await page.route("**/api/v1/profile", route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    profileWrites++;
    return route.fulfill({ json: { ...route.request().postDataJSON(), phone: null, address: null, updatedAt: "2026-09-26T12:01:00Z" } });
  });
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Опишите свою сделку" })).toBeVisible();
  await expect(page.getByText("Данные и материалы", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Что хотите оформить?" }).fill(draft.draft.description);
  await page.getByRole("button", { name: "Подобрать договор с ИИ" }).click();
  await expect(page.getByText("Определена продажа")).toBeHidden();
  await page.getByRole("button", { name: "Заполнить реквизиты", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои реквизиты для договора" })).toBeVisible();
  await page.getByRole("button", { name: "Заполнить реквизиты вручную" }).click();
  await expect(page.getByRole("dialog").getByLabel("Серия паспорта", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот" }).click();
  await expect(page.getByRole("dialog").locator('input[type="file"]')).toHaveCount(3);
  await expect(page.getByRole("dialog")).toContainText("скриншотов");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Вставить из Цифрового ID / Госуслуг" }).click();
  await page.getByLabel("Скопированный текст").fill("Фамилия: Примеров\nИмя: Иван\nСерия и номер: 1234 567890");
  await page.getByRole("button", { name: "Перенести в форму" }).click();
  const review = page.getByRole("dialog", { name: "Мои реквизиты для договора" });
  await expect(review.getByLabel("Фамилия", { exact: true })).toHaveValue("Примеров");
  await expect(review.getByLabel("Серия паспорта", { exact: true })).toHaveValue("1234");
  expect(profileWrites).toBe(0);
  await page.screenshot({ path: "test-results/requisites-review.png" });
  await review.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(review).toBeHidden();
  expect(profileWrites).toBe(1);
  await expect(page.getByText("Реквизиты сохранены", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Ваша роль в сделке" }).click();
  await page.getByRole("option").first().click();
  await page.screenshot({ path: "test-results/requisites-ready.png" });
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Цена", exact: true })).toHaveValue("1000");
});
