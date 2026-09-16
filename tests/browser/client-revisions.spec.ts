import { expect, test } from "@playwright/test";
import { actor, noOverflow, onboarding, selectSupplierRole } from "./helpers";

test("legal documents are available only during registration and reading does not accept them", async ({ browser }) => {
  const context = await actor(browser, 72011, "+79997002011");
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Опишите свою сделку" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Подпишите и сохраните", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Подпишите и сохраните" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Документы и согласия", exact: true })).toHaveCount(0);
  await expect(page.locator(".legal-document-link")).toHaveCount(0);
  await page.screenshot({ path: "test-results/start-chapters.png", fullPage: true });
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  const accept = page.getByRole("button", { name: "Принять и продолжить", exact: true });
  await expect(accept).toBeDisabled();
  for (const [label, title] of [
    ["Обработка персональных данных", "Обработка персональных данных"],
    ["Условия использования", "Пользовательские условия / оферта"],
    ["Уведомления о статусах", "Согласие на сервисные уведомления"],
    ["Простая электронная подпись", "Соглашение о простой электронной подписи"],
  ]) {
    const trigger = page.getByRole("group", { name: label, exact: true }).getByRole("button", { name: "Ознакомиться", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).not.toContainText("Проект · версия");
    await expect(dialog.getByRole("article")).toHaveCount(1);
    await expect(dialog.getByRole("article").getByRole("heading")).toHaveText(title);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(accept).toBeDisabled();
  }
  for (const label of ["Обработка персональных данных", "Условия использования", "Уведомления о статусах"]) {
    await expect(page.getByRole("switch", { name: label, exact: true })).not.toBeChecked();
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 }); await noOverflow(page);
  }
  await onboarding(page, false);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Основные данные", exact: true })).toBeVisible();
  await expect(page.locator(".legal-document-link")).toHaveCount(0);
  await context.close();
});

test("early invite protects the offer and allows parallel profile entry without freezing the draft", async ({ browser }) => {
  const firstContext = await actor(browser, 72012, "+79997002012");
  const secondContext = await actor(browser, 72013, "+79997002013");
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  await first.goto("/"); await onboarding(first);
  await first.getByRole("button", { name: "Создать", exact: true }).click();
  await first.getByRole("tab", { name: "Готовые шаблоны" }).click();
  await first.getByRole("button", { name: /Оказание услуг/ }).click();
  await first.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(first.getByRole("button", { name: "Пригласить сейчас", exact: true })).toBeDisabled();
  const description = "Закрытое предложение: подготовить презентацию для компании";
  await first.getByRole("textbox", { name: /^Краткое описание/ }).fill(description);
  const responsePromise = first.waitForResponse(response => response.url().endsWith("/invitations") && response.request().method() === "POST");
  await first.getByRole("button", { name: "Пригласить сейчас", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const invitation = await response.json();
  const dealId = response.url().split("/deals/")[1]!.split("/")[0];
  const token = invitation.shareUrl.split("#")[1];
  const publicPreview = await second.request.get(`/api/v1/public/invitations/${invitation.publicCode}`);
  expect(await publicPreview.text()).not.toContain(description);
  expect((await second.request.post("/api/v1/public/invitations/preview", { data: { publicCode: invitation.publicCode, token: "x".repeat(32) } })).status()).toBe(404);
  expect((await first.request.get(`/api/v1/deals/${dealId}/workspace`)).ok()).toBe(true);
  const publicPage = await secondContext.newPage();
  await publicPage.goto(invitation.shareUrl);
  await expect(publicPage.locator(".invitation-offer")).toContainText(description);
  for (const width of [390, 1440]) {
    await publicPage.setViewportSize({ width, height: 900 });
    await noOverflow(publicPage);
    const trustCard = (await publicPage.locator(".public-invite-trust-card").boundingBox())!;
    const offerCard = (await publicPage.locator(".invitation-offer").boundingBox())!;
    expect(offerCard.y - trustCard.y - trustCard.height).toBeGreaterThanOrEqual(16);
    await publicPage.screenshot({ path: `test-results/invitation-spacing-${width}.png`, fullPage: true });
  }
  await publicPage.close();
  await second.goto(`/?WebAppStartParam=${encodeURIComponent(`invite_${invitation.publicCode}_${token}`)}`);
  await expect(second.getByText(description, { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Продолжить оформление", exact: true }).click();
  await onboarding(second, false);
  await expect(second.getByText("Условия ещё готовятся", { exact: true })).toBeVisible();
  await expect(second.getByRole("button", { name: "Редактировать черновик" })).toHaveCount(0);
  const workspace = await (await first.request.get(`/api/v1/deals/${dealId}/workspace`)).json();
  expect(workspace.status).toBe("DRAFT");
  expect(workspace.counterparty).not.toBeNull();
  expect((await second.request.patch(`/api/v1/deals/${dealId}/draft`, { data: { description: "Чужая перезапись", expectedUpdatedAt: workspace.updatedAt } })).status()).toBe(403);
  expect((await second.request.post(`/api/v1/deals/${dealId}/versions/${workspace.versionId}/approve`, { data: { expectedDealUpdatedAt: workspace.updatedAt } })).status()).toBe(409);
  await second.getByRole("button", { name: "Мои данные для договора", exact: true }).click();
  await second.getByLabel("Фамилия", { exact: true }).fill("Примерова");
  await second.getByLabel("Имя", { exact: true }).fill("Анна");
  await second.getByRole("button", { name: "Сохранить профиль", exact: true }).click();
  await expect(second.getByText("Изменения сохранены", { exact: true })).toBeVisible();
  await first.getByRole("textbox", { name: /^Краткое описание/ }).fill(`${description}. Результат в PDF.`);
  await selectSupplierRole(first);
  await first.getByRole("button", { name: "Сохранить и продолжить", exact: true }).click();
  await expect(first.getByRole("heading", { name: "Параметры сделки" })).toBeVisible();
  await first.screenshot({ path: "test-results/early-invitation-questionnaire.png", fullPage: true });
  // Creation intentionally hides bottom navigation; unload the editor before API checks.
  await first.goto("/");
  await first.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  const current = await (await first.request.get(`/api/v1/deals/${dealId}`)).json();
  const answers = {
    serviceDescription: "Подготовить презентацию на 10 слайдов. Передача и приёмка результата по акту.",
    serviceLocation: "Онлайн", completionDate: "2099-09-20", paymentAmount: 15000,
    paymentProcedure: "После оказания услуги",
  };
  const clarification = await first.request.post("/api/v1/templates/paid-services/clarifications", { data: { templateVersionId: current.template.versionId, answers, description, subjectDocumentsParty: current.draft.subjectDocumentsParty } });
  expect(clarification.ok()).toBe(true);
  const session = await clarification.json();
  expect(session.status).toBe("READY_TO_GENERATE");
  const generationUrl = `/api/v1/templates/paid-services/clarifications/${session.id}/generation`;
  expect((await first.request.post(generationUrl)).ok()).toBe(true);
  await expect.poll(async () => (await (await first.request.get(generationUrl)).json()).status).toBe("COMPLETED");
  const generation = await (await first.request.get(generationUrl)).json();
  const savedResponse = await first.request.patch(`/api/v1/deals/${dealId}/draft`, { data: { answers, currentStep: "INITIATOR", sourceGenerationId: generation.id, expectedUpdatedAt: current.updatedAt } });
  expect(savedResponse.ok()).toBe(true);
  const saved = await savedResponse.json();
  const started = await first.request.post(`/api/v1/deals/${dealId}/agreement/start`, { data: { expectedVersionId: saved.versionId, expectedUpdatedAt: saved.updatedAt } });
  expect(started.ok()).toBe(true);
  expect((await started.json()).status).toBe("DOCUMENTS_PENDING");
  const after = await (await second.request.get(`/api/v1/deals/${dealId}/workspace`)).json();
  expect(after.currentUserRole).toBe("COUNTERPARTY");
  expect(after.contractDraft).not.toBeNull();
  expect(after.approvals.totalApproved).toBe(0);
  await firstContext.close(); await secondContext.close();
});

test("manual address is saved and remains visibly unverified", async ({ browser }) => {
  const context = await actor(browser, 72014, "+79997002014");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByLabel("Фамилия", { exact: true }).fill("Примеров");
  await page.getByLabel("Имя", { exact: true }).fill("Иван");
  const value = "Москва, улица Примерная, дом 10";
  await page.route("**/api/v1/data-normalization/addresses/normalize", route => route.fulfill({ json: { value, source: "MANUAL", city: null, fiasId: null, house: null, kladrId: null, postalCode: null, qualityCode: null, region: null, street: null } }));
  await page.getByLabel("Адрес регистрации", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Сохранить профиль", exact: true }).click();
  await expect(page.getByText("Изменения сохранены", { exact: true })).toBeVisible();
  await expect(page.getByText(/Адрес сохранён вручную/)).toBeVisible();
  const profile = await (await page.request.get("/api/v1/profile")).json();
  expect(profile.address).toMatchObject({ value, source: "MANUAL", fiasId: null });
  await expect(page.getByText("Что подтверждено", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Уровни доверия", { exact: true })).toHaveCount(0);
  await expect(page.getByText("MAX подключён", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Основные данные", exact: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: `test-results/profile-without-trust-${width}.png`, fullPage: true });
  }
  await context.close();
});
