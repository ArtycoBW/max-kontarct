import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { actor, futureDate, maxProof, noOverflow, onboarding } from "./helpers";

test("two participants create, review, approve, sign and verify a deal", async ({ browser }) => {
  const initiator = await actor(browser, 71001, "+79997001001");
  const counterparty = await actor(browser, 71002, "+79997001002");
  const first = await initiator.newPage();
  const second = await counterparty.newPage();
  await first.goto("/");
  await onboarding(first);
  await first.getByRole("button", { name: "Профиль", exact: true }).click();
  await first.getByLabel("Фамилия", { exact: true }).fill("Инициаторов");
  await first.getByLabel("Имя", { exact: true }).fill("Иван");
  await first.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(first.getByText("Изменения сохранены", { exact: true })).toBeVisible();
  await first.getByRole("button", { name: "Создать", exact: true }).click();
  await first.getByRole("button", { name: /Аренда имущества/ }).click();
  await first.getByRole("button", { name: "Продолжить", exact: true }).click();
  await first.getByLabel("Название сделки", { exact: true }).fill("Браузерная проверка аренды");
  await first.getByRole("textbox", { name: /^Краткое описание/ }).fill("Аренда комнаты на десять дней с мебелью, стоимость 2000 рублей в день.");
  await first.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await noOverflow(first);
  await expect(first.getByRole("heading", { name: "Параметры сделки" })).toBeVisible();
  await first.getByRole("textbox", { name: "Предмет аренды", exact: true }).fill("Комната с мебелью, Москва, улица Примерная, дом 10, квартира 2");
  await futureDate(first, "Дата начала аренды", 10);
  await futureDate(first, "Дата окончания аренды", 20);
  await first.getByRole("textbox", { name: "Размер платежа, ₽", exact: true }).fill("2000");
  await first.getByRole("combobox", { name: "Периодичность оплаты" }).click();
  await first.getByRole("option", { name: "Посуточно", exact: true }).click();
  await first.getByLabel("Обеспечительный платёж, ₽", { exact: true }).fill("5000");
  await first.getByRole("switch", { name: "Коммунальные платежи включены" }).check();
  await first.getByRole("button", { name: "Продолжить", exact: true }).click();
  // The known utilities answer suppresses a redundant AI clarification.
  await expect(first.getByRole("heading", { name: "Условия собраны" })).toBeVisible();
  await first.getByRole("button", { name: "Подготовить договор", exact: true }).click();
  await first.getByRole("button", { name: "Проверить свои данные" }).click();
  await first.getByRole("button", { name: "Сохранить сделку" }).click();
  await first.getByRole("button", { name: /Браузерная проверка аренды/ }).click();
  const invitationResponse = first.waitForResponse(response => response.url().endsWith("/invitations") && response.request().method() === "POST");
  await first.getByRole("button", { name: "Создать приглашение" }).click();
  const invitation = await (await invitationResponse).json();
  await second.goto(invitation.shareUrl);
  await expect(second.getByRole("button", { name: "Я ознакомился" })).toBeVisible();
  await noOverflow(second);
  await second.getByRole("button", { name: "Я ознакомился" }).click();
  await second.getByRole("link", { name: "Продолжить оформление" }).click();
  await second.getByRole("button", { name: "Я ознакомился" }).click();
  await second.getByRole("button", { name: "Продолжить оформление" }).click();
  await onboarding(second, false);
  await expect(second.getByRole("button", { name: "Документы сделки" })).toBeVisible();
  await second.getByRole("button", { name: "Заполнить профиль" }).click();
  await second.getByLabel("Фамилия", { exact: true }).fill("Участникова");
  await second.getByLabel("Имя", { exact: true }).fill("Анна");
  await second.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(second.getByText("Изменения сохранены", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Сделки", exact: true }).click();
  await second.getByRole("button", { name: /Браузерная проверка аренды/ }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0XsAAAAASUVORK5CYII=", "base64");
  const longFilename = "Личный-документ-первого-" + "a9b3c0d1".repeat(12) + ".png";
  for (const [page, name] of [[first, longFilename], [second, "Личный-документ-второго.png"]] as const) {
    await expect(page.getByRole("button", { name: "Согласовать версию 1" })).toHaveCount(0);
    await page.getByRole("button", { name: "Документы сделки" }).click();
    await page.locator(".requirement-upload-card").filter({ hasText: "Обязательно" }).locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
    await expect(page.getByText("Файл загружен", { exact: true })).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 740 });
      expect(await page.locator(".upload-success-card").evaluate(card => {
        const icon = card.querySelector("svg")!.getBoundingClientRect();
        const text = card.querySelector("small")!.getBoundingClientRect();
        const bounds = card.getBoundingClientRect();
        return icon.width >= 18 && text.right <= bounds.right && card.scrollWidth <= card.clientWidth;
      })).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/upload-${page === first ? "first" : "second"}.png`, fullPage: true });
    await noOverflow(page);
  }
  await expect(second.getByText(longFilename, { exact: true })).toHaveCount(0);
  const privateFileUrl = await first.getByRole("link", { name: /^Личный-документ-первого/ }).getAttribute("href");
  const outsider = await browser.newContext({ baseURL: "http://127.0.0.1:4300" });
  expect((await outsider.request.get(privateFileUrl!)).status()).toBe(401);
  expect((await outsider.request.post("/api/v1/auth/max", { data: { initData: maxProof(71004) } })).ok()).toBe(true);
  expect((await outsider.request.get(privateFileUrl!)).status()).toBe(404);
  const workspaceUrl = privateFileUrl!.split("/files/")[0] + "/workspace";
  expect((await outsider.request.get(workspaceUrl)).status()).toBe(404);
  await outsider.close();
  await first.locator(".documents-section").filter({ hasText: "Материалы и доказательства" }).locator('input[type="file"]').setInputFiles({ name: "Общий-акт.png", mimeType: "image/png", buffer: png });
  await expect(first.getByText("Общий-акт.png", { exact: true }).first()).toBeVisible();
  const administrator = await actor(browser, 71003, "+79997001003");
  const admin = await administrator.newPage();
  await admin.goto("/");
  await onboarding(admin);
  expect((await admin.request.post("http://127.0.0.1:4301/_test/admin/71003")).ok()).toBe(true);
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "Проверка файлов" }).click();
  await expect(admin.locator(".admin-file-review-card")).toHaveCount(3);
  for (const name of [longFilename, "Личный-документ-второго.png", "Общий-акт.png"]) {
    await admin.locator(".admin-file-review-card").filter({ hasText: name }).getByRole("button", { name: "Проверить", exact: true }).click();
    if (name === longFilename) {
      await admin.getByLabel("Комментарий").fill('<img src=x onerror="window.__xss=true"> ' + "ДлинныйКомментарийБезПробелов".repeat(20));
      await admin.screenshot({ path: "test-results/review-dialog-mobile.png", fullPage: true });
    }
    await noOverflow(admin);
    await admin.getByRole("dialog").getByRole("button", { name: "Принять", exact: true }).click();
    await expect(admin.getByRole("dialog")).toHaveCount(0);
    await expect(admin.locator(".admin-file-review-card").filter({ hasText: name }).getByText("Принят", { exact: true })).toBeVisible();
    const card = admin.locator(".admin-file-review-card").filter({ hasText: name });
    await expect(card.getByRole("button", { name: "Проверить", exact: true })).toHaveCount(0);
    await card.getByRole("button", { name: "Результат проверки", exact: true }).click();
    await expect(admin.getByRole("dialog").getByRole("button", { name: /^(Принять|Отклонить)$/ })).toHaveCount(0);
    await expect(admin.getByRole("dialog").getByLabel("Комментарий")).toHaveAttribute("readonly", "");
    await admin.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).last().click();
  }
  expect(await admin.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(admin);
  await admin.screenshot({ path: "test-results/admin-cards-desktop.png", fullPage: true });
  for (const page of [first, second]) {
    await page.getByRole("button", { name: "Сделки", exact: true }).click();
    await page.getByRole("button", { name: /Браузерная проверка аренды/ }).click();
    await page.getByRole("button", { name: "Согласовать версию 1", exact: true }).click();
  }
  for (const [page, phone] of [[first, "+79997001001"], [second, "+79997001002"]] as const) {
    await expect(page.getByRole("checkbox")).toBeVisible({ timeout: 45_000 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Получить код подписи" }).click();
    await expect(page.getByLabel("Цифра 1")).toBeVisible();
    const { code } = await (await page.request.get(`http://127.0.0.1:4301/_test/otp/${encodeURIComponent(phone)}`)).json();
    expect(code).toMatch(/^\d{4}$/);
    for (let i = 0; i < 4; i++) await page.getByLabel(`Цифра ${i + 1}`).fill(code[i]);
    await page.getByRole("button", { name: "Подписать договор" }).click();
  }
  // The first tab stays open: the second party's signature must appear without navigation.
  for (const page of [first, second]) {
    await expect(page.getByRole("heading", { name: "Договор и материалы готовы" })).toBeVisible({ timeout: 30_000 });
    await noOverflow(page);
  }
  await first.screenshot({ path: "test-results/completed-mobile.png", fullPage: true });
  await first.locator(".mini-app-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  const bottomGap = await first.getByRole("button", { name: "Документы сделки", exact: true }).evaluate(element => {
    const scroll = element.closest(".mini-app-scroll")!;
    return scroll.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom;
  });
  expect(bottomGap).toBeGreaterThanOrEqual(20);
  await first.screenshot({ path: "test-results/completed-mobile-bottom.png", fullPage: true });
  const pdfDownload = first.waitForEvent("download");
  await first.getByRole("link", { name: "Скачать подписанный PDF" }).click();
  const pdf = await pdfDownload;
  await pdf.saveAs("test-results/contract.pdf");
  const pdfBytes = await readFile("test-results/contract.pdf");
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  const verifyUrl = pdfBytes.toString("latin1").match(/http:\/\/127\.0\.0\.1:4300\/verify\/[A-Za-z0-9_-]+/)?.[0];
  expect(verifyUrl).toBeTruthy();
  const zipDownload = first.waitForEvent("download");
  await first.getByRole("link", { name: "Скачать пакет материалов" }).click();
  await (await zipDownload).saveAs("test-results/materials.zip");
  const zip = await JSZip.loadAsync(await readFile("test-results/materials.zip"));
  const manifest = JSON.parse(await zip.file("manifest.sha256.json")!.async("string"));
  expect(manifest.algorithm).toBe("SHA-256");
  for (const entry of manifest.files) {
    const body = await zip.file(entry.path)!.async("nodebuffer");
    expect(createHash("sha256").update(body).digest("hex")).toBe(entry.sha256);
    expect(body.length).toBe(entry.sizeBytes);
  }
  expect(Object.keys(zip.files).join(" ")).not.toContain("Личный-документ");
  const publicContext = await browser.newContext();
  const verification = await publicContext.newPage();
  await verification.goto(verifyUrl!);
  await expect(verification.getByRole("heading", { name: "Целостность подтверждена" })).toBeVisible();
  await expect(verification.getByText(createHash("sha256").update(pdfBytes).digest("hex"), { exact: true })).toBeVisible();
  await expect(verification.getByText(/Инициаторов|Участникова/)).toHaveCount(0);
  await noOverflow(verification);
  await verification.screenshot({ path: "test-results/verification-desktop.png", fullPage: true });
  await verification.setViewportSize({ width: 1440, height: 1000 });
  await noOverflow(verification);
  await verification.screenshot({ path: "test-results/verification-wide.png", fullPage: true });
  await publicContext.close();
  await administrator.close();
  await initiator.close();
  await counterparty.close();
});
