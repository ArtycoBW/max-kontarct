import { expect, test, type Page } from "@playwright/test";
import { pepAgreement } from "../../apps/api/src/signing/pep-agreement";

// Entirely local fixtures; no real MAX, passport data, API or database writes.
async function mockApp(page: Page) {
  const writes: string[] = [];
  await page.route("https://st.max.ru/js/max-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: "window.WebApp={initData:'layout-test',initDataUnsafe:{},ready(){},expand(){}}" }));
  await page.route("**/api/v1/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/v1/auth/presence") return route.fulfill({ status: 204 });
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

test("Android sharing marks sent only after shared, not opening, cancellation or an unknown result", async ({ page }) => {
  const workspace = { ...workspaceFixture(), currentUserRole: "INITIATOR", counterparty: null };
  await openMockDeal(page, workspace as unknown as ReturnType<typeof workspaceFixture>);
  await page.evaluate(() => {
    Object.assign(window.WebApp!, { platform: "android", shareMaxContent: (params: unknown) => { document.body.dataset.shareParams = JSON.stringify(params); document.body.dataset.shareGesture = String(navigator.userActivation.isActive); return new Promise(resolve => { (window as unknown as { resolveShare: typeof resolve }).resolveShare = resolve; }); } });
  });
  await page.route("**/deals/review-deal/invitations", route => route.fulfill({ json: { id: "invite", state: "ACTIVE", shareText: "Создание презентации за 10000 рублей", shareUrl: "https://example.test/invite/1#secret", expiresAt: "2099-01-01T00:00:00Z" } }));
  let sent = 0;
  await page.route("**/deals/review-deal/invitations/invite/sent", route => { sent++; return route.fulfill({ json: { sentAt: new Date().toISOString() } }); });
  await page.getByRole("button", { name: "Создать приглашение", exact: true }).click();
  await expect(page.getByRole("button", { name: "Я отправил приглашение", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Отправить в MAX", exact: true }).click();
  expect(sent).toBe(0);
  expect(JSON.parse((await page.locator("body").getAttribute("data-share-params"))!)).toMatchObject({ link: "https://example.test/invite/1#secret" });
  expect(await page.locator("body").getAttribute("data-share-gesture")).toBe("true");
  await page.evaluate(() => (window as unknown as { resolveShare: (result: unknown) => void }).resolveShare({ status: "cancelled" }));
  await expect(page.getByText("Отправка отменена.", { exact: true })).toBeVisible();
  expect(sent).toBe(0);
  await page.getByRole("button", { name: "Отправить в MAX", exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveShare: (result: unknown) => void }).resolveShare({}));
  await expect(page.getByText(/MAX не подтвердил отправку/)).toBeVisible();
  expect(sent).toBe(0);
  await page.getByRole("button", { name: "Отправить в MAX", exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveShare: (result: unknown) => void }).resolveShare({ error: { code: "timeout" } }));
  await expect(page.getByText("Не удалось открыть отправку. Используйте ссылку ниже или скопируйте приглашение.")).toBeVisible();
  expect(sent).toBe(0);
  await page.getByRole("button", { name: "Отправить в MAX", exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolveShare: (result: unknown) => void }).resolveShare({ status: "shared" }));
  await expect.poll(() => sent).toBe(1);
  await expect(page.getByText("Приглашение отправлено.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть приглашение в MAX" })).toBeVisible();
});

test("Android downloads use a scoped prepared link and a fresh native click", async ({ page }) => {
  await openMockDeal(page, workspaceFixture("COMPLETED", true));
  await page.evaluate(() => {
    Object.assign(window.WebApp!, { platform: "android", downloadFile: (url: string, filename: string) => { document.body.dataset.download = JSON.stringify({ url, filename, gesture: navigator.userActivation.isActive }); return Promise.resolve({}); } });
  });
  const artifact = (kind: string) => ({ id: kind, originalName: kind === "final-pdf" ? "Договор.pdf" : "Материалы.zip", mimeType: "application/pdf", sizeBytes: 1000, downloadUrl: `/api/v1/deals/review-deal/artifacts/${kind}` });
  await page.route("**/deals/review-deal/signing", route => route.fulfill({ json: { contractNumber: "Тест", currentUserSigned: true, dealId: "review-deal", documentHash: "a".repeat(64), finalPdf: artifact("final-pdf"), evidencePackage: artifact("evidence-package"), parties: [], pepAgreement: pepAgreement("v1"), requiredSignatures: 2, totalSignatures: 2, status: "COMPLETED", versionId: "version", versionNumber: 2 } }));
  const paths: string[] = [];
  await page.route("**/downloads/prepare", route => { expect(route.request().headers()["content-type"]).toBe("application/json"); paths.push(route.request().postDataJSON().path); return route.fulfill({ json: { url: "https://example.test/api/v1/downloads/content?ticket=test-only", filename: "Договор.pdf", expiresAt: new Date(Date.now() + 120000).toISOString() } }); });
  await expect(page.getByRole("heading", { name: "Подпишите и сохраните" })).toBeVisible();
  await page.getByRole("link", { name: "Скачать подписанный PDF" }).click();
  const modal = page.getByRole("dialog", { name: "Скачать файл" });
  await modal.getByRole("button", { name: "Скачать на устройство" }).click();
  expect(paths).toEqual(["/api/v1/deals/review-deal/artifacts/final-pdf"]);
  const received = JSON.parse((await page.locator("body").getAttribute("data-download"))!);
  expect(received).toMatchObject({ gesture: true, filename: "Договор.pdf", url: "https://example.test/api/v1/downloads/content?ticket=test-only" });
  await expect(modal.getByText("Файл передан в загрузки MAX.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Документы сделки", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/android-native-download.png" });
});

test("materials use role-specific empty text and uploader action; incomplete parties cannot view the contract", async ({ page }) => {
  const workspace = workspaceFixture("TERMS_REVIEW", false);
  await openMockDeal(page, workspace);
  await page.route("**/deals/review-deal/files", route => route.fulfill({ json: { evidenceFiles: [], requirements: [], canUploadEvidence: false } }));
  await expect(page.locator(".deal-panel-trigger").filter({ hasText: /^Договор/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Приложения к договору/ }).click();
  await expect(page.getByRole("dialog")).toContainText("продавец ещё не загрузил дополнительные материалы");
  await page.keyboard.press("Escape");
  workspace.currentUserRole = "INITIATOR";
  await expect(page.getByRole("button", { name: /Загрузите материалы сделки/ })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Мои реквизиты для договора" })).toHaveCount(0);
  await expect(page.getByText("Шаг 4 из 5", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Пригласите вторую сторону уже сейчас", { exact: true })).toHaveCount(0);
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

test("full requisites are visible before approval without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 650 });
  const workspace = { ...workspaceFixture("TERMS_REVIEW", true), requisites: { hash: "a".repeat(64), frozen: false, parties: [{
    role: "INITIATOR", fullName: "Примеров Иван Петрович", birthDate: "1990-01-01", address: "Тестовый город, улица Примерная, дом 1", email: "example@example.test", phone: "+79990000001",
    passport: { series: "1234", number: "567890", issuedAt: "2020-01-02", issuer: "Тестовое подразделение по Примерному району", divisionCode: "123-456", birthPlace: "Тестовый город", gender: "М" },
  }] } };
  await openMockDeal(page, workspace);
  await page.locator(".deal-panel-trigger").filter({ hasText: /^Договор/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Реквизиты сторон" })).toBeVisible();
  await dialog.getByText("1234 567890", { exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByText("1234 567890", { exact: true })).toBeVisible();
  await expect(dialog.getByText("+79990000001", { exact: true })).toHaveCount(1);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/contract-requisites-mobile.png" });
});

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
  await expect(page.getByRole("button", { name: "Документы сделки", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.locator(".document-deal-list").getByRole("button", { name: /Тестовая сделка/ }).click();
  await expect(page.getByText("Все материалы сделки", { exact: true })).toBeVisible();
  await expect(page.locator(".deal-file-row")).toHaveCount(7);
  await expect(page.locator(".requirement-upload-card")).toHaveCount(0);
  await expect(page.getByText("Обязательные документы", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/На проверке|Нужно исправить/)).toHaveCount(0);
  await page.locator(".mini-app-scroll").evaluate(el => { el.scrollTop = 700; });
  await expect(page.locator(".documents-screen > .flow-header")).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".documents-screen > .flow-header")).toHaveCSS("position", "sticky");
  await page.screenshot({ path: "test-results/documents-sticky-all-materials.png" });
});

test("final contract is edited in one modal; errors retain the text and save uses the opened revision", async ({ page }) => {
  const workspace = { ...workspaceFixture("TERMS_REVIEW", true), currentUserRole: "INITIATOR" };
  await openMockDeal(page, workspace);
  let posted: Record<string, unknown> | null = null;
  let invalid = true;
  await page.route("**/api/v1/deals/review-deal/text-versions", route => {
    posted = route.request().postDataJSON();
    if (invalid) return route.fulfill({ status: 400, json: { code: "CONTRACT_REVISION_INVALID", message: "Исправьте отмеченные условия договора", details: { errors: [{ path: "sections", message: "Укажите срок оплаты" }] } } });
    workspace.versionNumber = 3;
    workspace.versionId = "version-3";
    return route.fulfill({ json: workspace });
  });
  await page.getByRole("button", { name: "Редактировать договор", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Пункт 1.1", { exact: true }).fill("Изменённый предмет за 15000 рублей");
  await modal.getByLabel("Что изменилось", { exact: true }).fill("Уточнена стоимость");
  await modal.getByRole("button", { name: "Проверить и сохранить новую версию" }).click();
  await expect(modal.getByText("Укажите срок оплаты", { exact: true })).toBeVisible();
  await expect(modal.getByLabel("Пункт 1.1", { exact: true })).toHaveValue("Изменённый предмет за 15000 рублей");
  expect(posted).toMatchObject({ expectedVersionId: "version", expectedUpdatedAt: "2026-09-26T12:00:00Z", contractDraft: { sections: [{ clauses: ["Изменённый предмет за 15000 рублей"] }] } });
  invalid = false;
  await modal.getByLabel("Пункт 1.1", { exact: true }).fill("Стоимость 15000 рублей, оплата при встрече");
  await modal.getByRole("button", { name: "Проверить и сохранить новую версию" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".deal-version-label")).toContainText("версия 3");
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

test("saved passport details can be chosen from the profile without re-entering them", async ({ page }) => {
  await mockApp(page);
  const workspace = workspaceFixture();
  await page.route("**/api/v1/profile", route => route.fulfill({ json: { firstName: "Анна", lastName: "Тестова", middleName: "Ивановна", birthDate: "1990-01-01", address: null, phone: null, email: null, updatedAt: null,
    passport: { series: "1234", number: "567890", issuedAt: "2020-01-02", issuer: "Тестовый отдел", divisionCode: "123-456", birthPlace: "Казань", gender: "Ж" },
  } }));
  await page.route("**/api/v1/deals", route => route.fulfill({ json: { items: [{ ...workspace, templateTitle: "Купля-продажа" }] } }));
  await page.route("**/api/v1/deals/review-deal/workspace", route => route.fulfill({ json: workspace }));
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: /Тестовая сделка/ }).click();
  await page.getByRole("button", { name: "Выбрать реквизиты из профиля" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByLabel("Серия паспорта", { exact: true })).toHaveValue("1234");
  await expect(modal.getByLabel("Номер паспорта", { exact: true })).toHaveValue("567890");
  await expect(modal.getByRole("button", { name: "Сохранить профиль" })).toHaveCount(1);
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
    await expect(dialog.getByText(/Обработка выполняется на устройстве|Это перенос реквизитов/)).toHaveCount(0);
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

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 700 }, { width: 768, height: 900 }, { width: 740, height: 390 }]) {
  test(`long deal list scrolls independently with a fixed create action at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApp(page);
    await page.route("**/api/v1/deals", route => route.fulfill({ json: { items: Array.from({ length: 30 }, (_, i) => ({
      id: `long-list-${i}`, title: `Сделка ${i + 1}`, templateTitle: "Оказание услуг", status: i % 2 ? "COMPLETED" : "DRAFT",
      counterpartyLastName: "Примеров", versionNumber: 1, updatedAt: "2026-09-26T12:00:00Z",
    })) } }));
    await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
    await page.getByRole("button", { name: "Сделки", exact: true }).click();
    await expect(page.locator(".deal-list-card")).toHaveCount(30);
    const list = page.getByRole("region", { name: "Список сделок" });
    const create = page.getByRole("button", { name: "Создать новую сделку", exact: true });
    const navigation = page.getByRole("navigation", { name: "Навигация приложения" });
    await expect(create).toBeInViewport();
    const before = await create.boundingBox();
    const listBox = await list.boundingBox();
    const appBox = await page.locator(".mini-app").boundingBox();
    const cardBox = await page.locator(".deal-list-card").first().boundingBox();
    // The scrollbar is at the app edge, while card/button edges stay aligned.
    expect(Math.abs(listBox!.x + listBox!.width - appBox!.x - appBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(cardBox!.x - before!.x)).toBeLessThan(1);
    expect(Math.abs(cardBox!.x + cardBox!.width - before!.x - before!.width)).toBeLessThan(2);
    const nav = await navigation.boundingBox();
    expect(before!.y + before!.height).toBeLessThanOrEqual(nav!.y);
    expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await list.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator(".deal-list-card").last()).toBeInViewport();
    const after = await create.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
    expect(await page.locator(".mini-app-scroll").evaluate(el => el.scrollTop)).toBe(0);
    await expect(page.getByRole("heading", { name: "Мои сделки" })).toBeInViewport();
    if (viewport.width === 390) await page.screenshot({ path: "test-results/deals-fixed-create.png" });
    await create.click();
    await expect(page.locator(".create-deal-screen")).toBeVisible();
  });
}

test("invitation gates a separate requisites step; uploads appear only with parameters", async ({ page }) => {
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
  let sentAt: string | null = null;
  const invitation = { id: "invite", state: "ACTIVE", shareUrl: "https://example.test/invite/1#secret", shareText: "Продажа стола", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-09-27T00:00:00Z", publicCode: "test", acceptedAt: null, maxDeeplink: null };
  await page.route("**/api/v1/deals/draft/workspace", route => route.fulfill({ json: { ...workspaceFixture(), ...draft, initiator: { profileCompleted: profileWrites > 0 }, counterparty: null, invitation: { ...invitation, sentAt } } }));
  await page.route("**/api/v1/deals/draft/invitations", route => route.fulfill({ json: invitation }));
  let failMarkOnce = true;
  await page.route("**/api/v1/deals/draft/invitations/invite/sent", route => {
    if (failMarkOnce) { failMarkOnce = false; return route.fulfill({ status: 503, json: { message: "Temporary failure" } }); }
    sentAt = new Date().toISOString(); return route.fulfill({ json: { ...invitation, sentAt } });
  });
  await page.route("**/api/v1/profile", route => {
    if (route.request().method() !== "PATCH") return route.fulfill({ json: {
      firstName: "Иван", lastName: "Примеров", middleName: null, birthDate: "1990-01-01", address: null, phone: null, email: null, updatedAt: null,
      passport: { series: "1234", number: "567890", issuedAt: "2020-01-02", issuer: "Тестовый отдел", divisionCode: "123-456", birthPlace: "Казань", gender: "М" },
    } });
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
  await page.getByRole("button", { name: "Перейти к приглашению", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои реквизиты для договора" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Загрузить фото или файл" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Ваша роль в сделке" }).click();
  await page.getByRole("option").first().click();
  await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeDisabled();
  await page.getByRole("button", { name: "Перевыпустить приглашение", exact: true }).click();
  await expect(page.getByRole("button", { name: "Отправить в MAX", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Я отправил приглашение", exact: true })).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }));
  await page.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await expect(page.getByText("Не удалось передать ссылку. Повторите отправку или скопируйте её.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeDisabled();
  expect(sentAt).toBeNull();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.resolve() } }));
  await page.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await expect(page.getByText("Не удалось сохранить отметку. Повторите отправку или копирование ссылки.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeDisabled();
  expect(sentAt).toBeNull();
  await page.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeEnabled();
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(page.getByRole("heading", { name: "Мои реквизиты для договора" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Выбрать реквизиты из профиля" })).toBeVisible();
  for (const viewport of [{ width: 768, height: 900 }, { width: 390, height: 700 }, { width: 320, height: 568 }, { width: 740, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.locator(".mini-app-scroll").evaluate(el => { el.scrollTop = 0; });
    const card = await page.locator(".requisites-step-content .deal-requisites").boundingBox();
    const content = await page.locator(".requisites-step-content").boundingBox();
    const heading = await page.locator(".requisites-step-screen .flow-header").boundingBox();
    expect(card!.y - heading!.y - heading!.height).toBeGreaterThanOrEqual(27);
    expect(Math.abs(card!.y + card!.height / 2 - content!.y - content!.height / 2)).toBeLessThan(1);
    expect(Math.abs(card!.x + card!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(await page.locator(".mini-app-scroll").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (viewport.height >= 700) {
      await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeInViewport();
      expect(Math.abs(card!.y + card!.height / 2 - viewport.height / 2)).toBeLessThan(45);
      await page.screenshot({ path: `test-results/requisites-centered-${viewport.width}.png` });
    } else {
      await page.getByRole("button", { name: "Сохранить и продолжить" }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "Сохранить и продолжить" })).toBeInViewport();
    }
  }
  await page.setViewportSize({ width: 390, height: 700 });
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
  await expect(page.getByRole("button", { name: "Загрузить фото или файл" })).toHaveCount(0);
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Цена", exact: true })).toHaveValue("1000");
  await expect(page.getByRole("button", { name: "Загрузить фото или файл" })).toBeVisible();
  await page.locator('.subject-materials input[type="file"]').setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("test-image") });
  await expect.poll(() => uploads).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "test-results/requisites-ready.png" });
});
