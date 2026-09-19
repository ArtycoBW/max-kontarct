import { expect, test, type Page } from "@playwright/test";

// Generated test documents only. All API calls are intercepted; nothing is uploaded.
function syntheticPdf(singlePage = false) {
  const stream = (label: string) => singlePage
    ? `BT /F1 22 Tf 40 790 Td (${label}) Tj ET\n${Array.from({ length: 34 }, (_, i) => `BT /F1 12 Tf 40 ${740 - i * 19} Td (Section ${i + 1}. Test contract terms and conditions.) Tj ET`).join("\n")}\n`
    : `BT /F1 24 Tf 40 230 Td (${label}) Tj ET\n0.2 0.5 0.6 rg 40 80 210 90 re f\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    singlePage ? "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" : "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${singlePage ? "595 842" : "300 300"}] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...["TEST PAGE 1", "TEST PAGE 2"].map(label => `<< /Length ${Buffer.byteLength(stream(label))} >>\nstream\n${stream(label)}endstream`),
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}

async function openFiles(page: Page) {
  const picture = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#dcece7"; ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = "#43685d"; ctx.fillRect(100, 80, 400, 240);
    ctx.fillStyle = "#fff"; ctx.font = "32px sans-serif"; ctx.fillText("TEST MATERIAL", 160, 215);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const files = [
    { id: "image", originalName: "Фото предмета сделки.png", mimeType: "image/png" },
    { id: "pdf", originalName: "Техническое задание с очень длинным названием.pdf", mimeType: "application/pdf" },
    { id: "bad", originalName: "Повреждённый.pdf", mimeType: "application/pdf" },
    { id: "private", originalName: "Закрытый.png", mimeType: "image/png" },
    { id: "other", originalName: "Архив.zip", mimeType: "application/zip" },
  ].map(file => ({ ...file, sizeBytes: 12345, owner: { displayName: "Тест", isCurrentUser: true }, category: "EVIDENCE", requirementId: null, reviewStatus: "PENDING", reviewComment: null, visibility: "DEAL_PARTICIPANTS", uploadedAt: "2026-09-18", sha256: "test" }));
  const reads: string[] = [];
  let approved = false;
  const messages: { id: string; body: string; isCurrentUser: boolean; kind: string; versionNumber: number; createdAt: string }[] = [];
  await page.route("https://st.max.ru/js/max-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: "window.WebApp={initData:'test',ready(){window.testReady=true},expand(){}}" }));
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "test", role: "USER", maxAccount: { firstName: "Тест", lastName: "Тест", maxUserId: "test" } } } });
    if (path.endsWith("/onboarding")) return route.fulfill({ json: { completed: true, phoneVerified: true, requiredConsentsAccepted: true, consents: [], phone: null } });
    if (path.endsWith("/deals")) return route.fulfill({ json: { items: [{ id: "deal", title: "Тестовые материалы", templateTitle: "Выполнение работ", versionNumber: 1, status: "DRAFT", updatedAt: "2026-09-18" }] } });
    if (path.endsWith("/deal/files")) return route.fulfill({ json: { dealId: "deal", dealTitle: "Тестовые материалы", dealStatus: "DRAFT", evidenceFiles: files, requirements: [], canUploadEvidence: false, allowedMimeTypes: [] } });
    if (path.endsWith("/deal/workspace")) return route.fulfill({ json: {
      id: "deal", title: "Тестовые материалы", status: "TERMS_REVIEW", versionId: "version", versionNumber: 1, updatedAt: "2026-09-19", currentUserRole: "INITIATOR",
      template: { title: "Выполнение работ", slug: "work-contract", versionId: "template" },
      approvals: { currentUserApproved: approved, required: 2, totalApproved: approved ? 1 : 0 },
      draft: { description: "Подготовка материалов", subjectDocumentsParty: "INITIATOR", answers: {} },
      initiator: { displayName: "Тест Первый", role: "INITIATOR", profileCompleted: true }, counterparty: { displayName: "Тест Второй", role: "COUNTERPARTY", profileCompleted: true }, invitation: null,
      contractDraft: { title: "Договор выполнения работ", preamble: "Стороны договорились о следующем.", warnings: [], sections: Array.from({ length: 15 }, (_, i) => ({ heading: `${i + 1}. Условия договора`, clauses: ["Исполнитель выполняет согласованные работы. Заказчик проверяет результат и оплачивает его в день приёмки."] })) },
    } });
    if (path.endsWith("/approve")) { approved = true; return route.fulfill({ json: { totalApproved: 1 } }); }
    if (path.endsWith("/messages")) {
      if (route.request().method() === "POST") messages.push({ ...route.request().postDataJSON(), id: String(messages.length), isCurrentUser: true, versionNumber: 1, createdAt: new Date().toISOString() });
      return route.fulfill({ json: { items: messages, nextCursor: null } });
    }
    if (path.endsWith("/content")) {
      const id = path.split("/").at(-2)!; reads.push(id);
      if (id === "private") return route.fulfill({ status: 403, json: { message: "Forbidden" } });
      return route.fulfill({ contentType: id === "image" ? "image/png" : "application/pdf", body: id === "image" ? Buffer.from(picture, "base64") : id === "bad" ? Buffer.from("broken") : syntheticPdf() });
    }
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto("/");
  await page.waitForFunction(() => (window as Window & { testReady?: boolean }).testReady);
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.getByRole("button", { name: /Тестовые материалы/ }).click();
  await expect(page.locator(".deal-file-row")).toHaveCount(5);
  expect(reads).toEqual([]);
  return reads;
}

for (const width of [320, 390, 1440]) test(`image and multipage PDF preview at ${width}px`, async ({ page }) => {
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { (window as Window & { revoked?: string[] }).revoked ??= []; (window as Window & { revoked: string[] }).revoked.push(url); original(url); };
  });
  await page.setViewportSize({ width, height: 844 });
  const reads = await openFiles(page);
  await page.screenshot({ path: `test-results/file-list-${width}.png`, fullPage: true });
  const opener = page.getByRole("button", { name: "Просмотреть Фото предмета сделки.png" });
  await opener.click();
  const dialog = page.getByRole("dialog");
  const image = dialog.getByRole("img", { name: "Фото предмета сделки.png" });
  await expect(image).toBeVisible();
  await dialog.getByRole("button", { name: "Увеличить", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сбросить масштаб" })).toHaveText("125%");
  await dialog.getByRole("button", { name: "Повернуть", exact: true }).click();
  await expect(image).toHaveCSS("transform", /matrix\(0, 1, -1, 0,/);
  await page.screenshot({ path: `test-results/image-preview-${width}.png` });
  await dialog.getByRole("combobox", { name: "Выбрать файл" }).click();
  await page.getByRole("option", { name: "Техническое задание с очень длинным названием.pdf" }).click();
  expect(await page.evaluate(() => (window as Window & { revoked?: string[] }).revoked?.length)).toBe(1);
  await expect(dialog.getByRole("navigation", { name: "Страницы PDF" })).toContainText("1 из 2");
  await expect(dialog.getByRole("img", { name: "Страница 1" })).toBeVisible();
  await dialog.getByRole("button", { name: "Следующая страница" }).click();
  await expect(dialog.getByRole("img", { name: "Страница 2" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Следующая страница" })).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Перейти к странице" }).click();
  await page.getByRole("option", { name: "1 из 2", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Страница 1" })).toBeVisible();
  await dialog.getByRole("button", { name: "Следующая страница" }).click();
  await dialog.getByRole("button", { name: "Увеличить", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Страница 2" })).toBeVisible();
  await page.screenshot({ path: `test-results/pdf-preview-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(dialog.getByRole("link", { name: "Скачать", exact: true })).toHaveAttribute("href", /\/pdf\/content$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(reads).toEqual(["image", "pdf"]);
});

test("corrupt PDF, denied access and unsupported types are recoverable", async ({ page }) => {
  const reads = await openFiles(page);
  await page.getByRole("button", { name: "Просмотреть Повреждённый.pdf" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Не удалось открыть");
  await dialog.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(reads.filter(id => id === "bad")).toHaveLength(2);
  await dialog.getByRole("combobox", { name: "Выбрать файл" }).click();
  await page.getByRole("option", { name: "Закрытый.png" }).click();
  await expect(dialog.getByRole("alert")).toContainText("У вас нет доступа");
  await dialog.getByRole("combobox", { name: "Выбрать файл" }).click();
  await page.getByRole("option", { name: "Архив.zip" }).click();
  await expect(dialog).toContainText("Для этого формата нет предпросмотра");
  expect(reads).not.toContain("other");
});

test("closing during a slow load cancels the request and leaves no viewer behind", async ({ page }) => {
  await openFiles(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/files/pdf/content", async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ contentType: "application/pdf", body: syntheticPdf() }).catch(() => {});
  });
  const request = page.waitForRequest("**/files/pdf/content");
  await page.getByRole("button", { name: "Просмотреть Техническое задание с очень длинным названием.pdf" }).click();
  await request;
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Просмотреть Фото предмета сделки.png" }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 1440]) test(`compact deal panels, nested preview and document return at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await openFiles(page);
  // Entry from the Documents tab must still go back to the document picker.
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Документы", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сделки", exact: true }).click();
  await page.getByRole("button", { name: /Тестовые материалы/ }).click();
  await expect(page.locator(".deal-panel-trigger")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Текст договора" })).toHaveCount(0);
  await expect(page.getByRole("log")).toHaveCount(0);
  await page.screenshot({ path: `test-results/compact-deal-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: /^Договор Версия/ }).click();
  const contract = page.getByRole("dialog", { name: "Договор", exact: true });
  await expect(contract.getByRole("region", { name: "Текст договора" })).toBeVisible();
  expect(await contract.locator(".deal-contract-preview").evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await contract.getByRole("button", { name: "Согласовать версию 1" }).click();
  await expect(contract.getByRole("button", { name: "Версия согласована", exact: true })).toBeDisabled();
  await page.screenshot({ path: `test-results/contract-modal-${width}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Приложения к договору Фото/ }).click();
  const attachments = page.getByRole("dialog", { name: "Приложения к договору", exact: true });
  await expect(attachments.getByRole("link", { name: /^Скачать/ })).toHaveCount(0);
  await expect(attachments.getByRole("button", { name: "Документы сделки" })).toHaveCount(0);
  await expect(attachments.locator(".deal-panel-footer")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await page.screenshot({ path: `test-results/attachments-clean-${width}.png` });
  await attachments.getByRole("button", { name: "Просмотреть Фото предмета сделки.png" }).click();
  const viewer = page.getByRole("dialog", { name: "Фото предмета сделки.png", exact: true });
  await expect(viewer.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(attachments).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Документы сделки", exact: true }).click();
  await expect(page.locator(".documents-screen")).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".deal-workspace-screen")).toBeVisible();
  await page.getByRole("button", { name: /^Чат сделки Обсудить/ }).click();
  const chat = page.getByRole("dialog", { name: "Чат сделки", exact: true });
  await chat.getByRole("combobox", { name: "Тип сообщения" }).click();
  await page.getByRole("option", { name: "Предложить изменения", exact: true }).click();
  await chat.getByRole("textbox", { name: "Сообщение участнику сделки" }).fill("Предлагаю изменить срок работ");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Чат сделки Обсудить/ }).click();
  await expect(chat.getByRole("textbox")).toHaveValue("Предлагаю изменить срок работ");
  await expect(chat.getByRole("combobox", { name: "Тип сообщения" })).toContainText("Предложить изменения");
  await chat.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(chat.getByRole("log")).toContainText("Предлагаю изменить срок работ");
  await page.screenshot({ path: `test-results/chat-modal-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const [width, height] of [[320, 568], [390, 640], [844, 390], [1440, 900]]) test(`single-page viewer layout at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await openFiles(page);
  await page.route("**/files/pdf/content", route => route.fulfill({ contentType: "application/pdf", body: syntheticPdf(true) }));
  await page.getByRole("button", { name: "Просмотреть Техническое задание с очень длинным названием.pdf" }).click();
  const viewer = page.locator(".file-preview-dialog");
  await expect(viewer.getByRole("img", { name: "Страница 1" })).toBeVisible();
  await expect(viewer.getByRole("navigation", { name: "Страницы PDF" })).toHaveCount(0);
  const viewport = viewer.locator(".file-preview-viewport");
  await expect(viewport).toHaveAttribute("aria-busy", "false");
  expect(await viewport.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await viewer.getByRole("button", { name: "Показать страницу целиком" }).click();
  await expect(viewport).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => viewport.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await viewer.getByRole("button", { name: "Повернуть", exact: true }).click();
  await expect(viewport).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => viewport.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (let turn = 0; turn < 3; turn++) await viewer.getByRole("button", { name: "Повернуть", exact: true }).click();
  await viewer.getByRole("button", { name: "Сбросить масштаб" }).click();
  await expect(viewport).toHaveAttribute("aria-busy", "false");
  for (const control of await viewer.locator("button, a").all()) {
    const rect = await control.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 1);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(height + 1);
  }
  await page.screenshot({ path: `test-results/single-pdf-${width}.png` });
  await viewer.getByRole("combobox", { name: "Выбрать файл" }).click();
  const options = page.getByRole("listbox");
  await expect(options).toBeVisible();
  const bounds = await options.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  await page.screenshot({ path: `test-results/file-picker-${width}.png`, animations: "disabled" });
  await page.getByRole("option", { name: "Фото предмета сделки.png", exact: true }).click();
  await expect(viewer.getByRole("img", { name: "Фото предмета сделки.png" })).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Скачать", exact: true })).toHaveAttribute("href", /\/image\/content$/);
});
