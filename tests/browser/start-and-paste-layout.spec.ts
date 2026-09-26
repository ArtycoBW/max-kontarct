import { expect, test, type Page } from "@playwright/test";
import { pepAgreement } from "../../apps/api/src/signing/pep-agreement";

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

const workspaceFixture = (status = "DRAFT", ready = false) => ({
  id: "review-deal", title: "Тестовая сделка", status, versionNumber: 2, versionId: "version", sourceGenerationId: "generation",
  currentUserRole: "COUNTERPARTY", updatedAt: "2026-09-26T12:00:00Z", createdAt: "2026-09-26T12:00:00Z",
  template: { slug: "movable-property-sale", title: "Купля-продажа", versionId: "template", versionNumber: 1 },
  initiator: { displayName: "Примеров Иван Петрович", role: "INITIATOR", profileCompleted: ready },
  counterparty: { displayName: "Тестова Анна Ивановна", role: "COUNTERPARTY", profileCompleted: ready },
  approvals: { currentUserApproved: false, totalApproved: 0, required: 2 }, invitation: null,
  draft: { description: "Продажа тестового предмета", subjectDocumentsParty: "INITIATOR", currentStep: "DESCRIPTION", answers: {}, clarificationSessionId: null, creationPath: "AI", initiator: null },
  contractDraft: { title: "Договор", preamble: "Стороны договорились", sections: [{ heading: "Предмет", clauses: ["Тестовый предмет"] }], warnings: [] },
});

test("generation waits for both profiles and submits the actual deal id", async ({ page }) => {
  await mockApp(page);
  const workspace = { ...workspaceFixture(), currentUserRole: "INITIATOR", contractDraft: null, sourceGenerationId: null };
  workspace.draft.currentStep = "AI_CLARIFICATION";
  const draft = { ...workspace, draft: { ...workspace.draft, clarificationSessionId: "session" } };
  const template = { slug: workspace.template.slug, title: "Купля-продажа", summary: "Имущество", currentVersion: { id: "template", versionNumber: 1, documentRequirements: [], questionnaireSchema: { type: "object", properties: {} } } };
  await page.route("**/api/v1/deals", route => route.fulfill({ json: { items: [{ ...workspace, templateTitle: template.title }] } }));
  await page.route("**/api/v1/deals/review-deal/workspace", route => route.fulfill({ json: workspace }));
  await page.route(/\/api\/v1\/deals\/review-deal(?:\/draft)?$/, route => route.fulfill({ json: draft }));
  await page.route("**/api/v1/templates**", route => route.fulfill({ json: route.request().url().endsWith("/templates") ? { items: [template] } : template }));
  await page.route("**/clarifications/session", route => route.fulfill({ json: { id: "session", status: "READY_TO_GENERATE", questions: [], answers: {}, round: 0 } }));
  let posted: unknown = null;
  await page.route("**/clarifications/session/generation", route => {
    if (route.request().method() === "POST") posted = route.request().postDataJSON();
    return route.fulfill({ json: { id: "session", status: "QUEUED", progress: 15, draft: null, clarificationAnswers: {} } });
  });
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: /Тестовая сделка/ }).click();
  await page.getByRole("button", { name: "Редактировать черновик" }).click();
  const action = page.getByRole("button", { name: "Подготовить договор", exact: true });
  await expect(action).toBeDisabled();
  workspace.initiator.profileCompleted = true;
  await expect(action).toBeDisabled();
  expect(posted).toBeNull();
  workspace.counterparty.profileCompleted = true;
  await expect(action).toBeEnabled();
  await action.click();
  expect(posted).toEqual({ dealId: "review-deal" });
});

async function openMockDeal(page: Page, workspace: ReturnType<typeof workspaceFixture>) {
  await mockApp(page);
  await page.route("**/api/v1/deals", route => route.fulfill({ json: { items: [{ ...workspace, templateTitle: "Купля-продажа" }] } }));
  await page.route("**/api/v1/deals/review-deal/workspace", route => route.fulfill({ json: workspace }));
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: /Тестовая сделка/ }).click();
}

test("all shared materials appear in one list and the documents header sticks", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openMockDeal(page, workspaceFixture());
  const file = (id: string) => ({ id, originalName: `Материал-${id}.jpg`, mimeType: "image/jpeg", sizeBytes: 5000,
    reviewStatus: "PENDING", reviewComment: null, visibility: "DEAL_PARTICIPANTS", owner: { isCurrentUser: true, displayName: "Тест" } });
  await page.route("**/api/v1/deals/review-deal/files", route => route.fulfill({ json: {
    dealId: "review-deal", dealTitle: "Тестовая сделка", dealStatus: "DRAFT", allowedMimeTypes: ["image/jpeg", "application/pdf"],
    maxUploadBytes: 10000000, canUploadEvidence: true,
    evidenceFiles: Array.from({ length: 5 }, (_, i) => file(`extra-${i}`)),
    requirements: [{ id: "property", required: false, title: "Документ на имущество", uploads: [file("ownership")] },
      { id: "photos", required: false, title: "Фотографии имущества", uploads: [file("photo")] }],
  } }));
  await page.getByRole("button", { name: "Документы сделки", exact: true }).click();
  await expect(page.getByText("Все материалы сделки", { exact: true })).toBeVisible();
  await expect(page.locator(".deal-file-row")).toHaveCount(7);
  await expect(page.locator(".requirement-upload-card")).toHaveCount(0);
  await page.locator(".mini-app-scroll").evaluate(el => { el.scrollTop = 700; });
  await expect(page.locator(".documents-screen > .flow-header")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".documents-screen > .flow-header")).toHaveCSS("position", "sticky");
  await page.screenshot({ path: "test-results/documents-sticky-all-materials.png" });
});

test("draft recipient sees all three entry methods and cannot open a premature contract", async ({ page }) => {
  await openMockDeal(page, workspaceFixture());
  await expect(page.getByRole("heading", { name: "Стороны и приглашения" })).toBeVisible();
  await expect(page.getByText("Обеим сторонам нужно заполнить реквизиты.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Вставить из Цифрового ID / Госуслуг" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Заполнить реквизиты вручную" })).toBeVisible();
  await expect(page.locator(".deal-panel-trigger").filter({ hasText: /^Договор/ })).toHaveCount(0);
  await expect(page.getByText(/Ваша роль:/)).toHaveCount(0);
  await expect(page.locator(".deal-version-label")).toHaveCSS("background-color", "rgb(255, 242, 191)");
});

test("profile link opens the expanded passport section, not the top", async ({ page }) => {
  await openMockDeal(page, workspaceFixture("DOCUMENTS_PENDING"));
  await page.getByRole("button", { name: "Заполнить профиль", exact: true }).click();
  await expect(page.getByLabel("Серия паспорта", { exact: true })).toBeInViewport();
  await expect.poll(() => page.locator(".mini-app-scroll").evaluate(el => el.scrollTop)).toBeGreaterThan(100);
});

test("changing the calendar year then closing retains the selected day", async ({ page }) => {
  await mockApp(page);
  await page.route("**/api/v1/profile", route => route.fulfill({ json: { firstName: "Тест", lastName: "Примеров", middleName: null, birthDate: "2000-02-29", address: null, passport: null, phone: null, email: null, updatedAt: null } }));
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.locator("#profile-birth-date").click();
  await page.getByRole("combobox", { name: "Год", exact: true }).click();
  await page.getByRole("option", { name: "2001", exact: true }).click();
  await page.locator(".date-picker-actions").getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator("#profile-birth-date")).toContainText("28.02.2001");
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 650 }, { width: 430, height: 844 }]) {
  test(`signing consent and OTP fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openMockDeal(page, workspaceFixture("READY_TO_SIGN", true));
    await page.route("**/api/v1/deals/review-deal/signing", route => route.fulfill({ json: {
      contractNumber: "MK-20260926-ABCDEF12-V2", currentUserSigned: false, dealId: "review-deal", documentHash: "a".repeat(64),
      evidencePackage: null, finalPdf: null, parties: [], pepAgreement: pepAgreement("v1"), requiredSignatures: 2,
      status: "READY_TO_SIGN", totalSignatures: 0, versionId: "version", versionNumber: 2,
    } }));
    await page.route("**/api/v1/deals/review-deal/signing/otp", route => route.fulfill({ json: {
      channel: "MAX_TEST", expiresAt: new Date(Date.now() + 300_000).toISOString(), resendAvailableAt: new Date(Date.now() + 60_000).toISOString(), maskedPhone: "+7***0000",
    } }));
    await page.getByRole("button", { name: "Подписать договор", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Подписание договора" });
    await expect(dialog.getByRole("button", { name: "Получить код подписи" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Получить код подписи" })).toBeInViewport({ ratio: 1 });
    expect(await dialog.locator(".deal-panel-body").evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await page.screenshot({ path: `test-results/signing-consent-${viewport.width}.png` });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Получить код подписи" }).click();
    await expect(dialog.getByRole("heading", { name: "Введите код" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Вернуться к соглашению" })).toBeInViewport({ ratio: 1 });
    expect(await dialog.locator(".deal-panel-body").evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await page.screenshot({ path: `test-results/signing-otp-${viewport.width}.png` });
  });
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
  let uploads = 0;
  await page.route("**/api/v1/deals/draft/files", route => {
    if (route.request().method() === "POST") { uploads++; return route.fulfill({ json: { id: "uploaded" } }); }
    return route.fulfill({ json: { dealId: "draft", dealTitle: draft.title, dealStatus: "DRAFT", allowedMimeTypes: ["image/png"], maxUploadBytes: 1000000, evidenceFiles: [], requirements: [], canUploadEvidence: true } });
  });
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
  await expect(page.getByRole("button", { name: "Загрузить фото или файл" })).toBeVisible();
  await page.locator('.subject-materials input[type="file"]').setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("test-image") });
  await expect.poll(() => uploads).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "test-results/requisites-ready.png" });
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Цена", exact: true })).toHaveValue("1000");
});
