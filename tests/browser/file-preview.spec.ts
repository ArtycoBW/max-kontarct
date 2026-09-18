import { expect, test, type Page } from "@playwright/test";

// Generated test documents only. All API calls are intercepted; nothing is uploaded.
function syntheticPdf() {
  const stream = (label: string) => `BT /F1 24 Tf 40 230 Td (${label}) Tj ET\n0.2 0.5 0.6 rg 40 80 210 90 re f\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
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
  await page.route("https://st.max.ru/js/max-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: "window.WebApp={initData:'test',ready(){window.testReady=true},expand(){}}" }));
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "test", role: "USER", maxAccount: { firstName: "Тест", lastName: "Тест", maxUserId: "test" } } } });
    if (path.endsWith("/onboarding")) return route.fulfill({ json: { completed: true, phoneVerified: true, requiredConsentsAccepted: true, consents: [], phone: null } });
    if (path.endsWith("/deals")) return route.fulfill({ json: { items: [{ id: "deal", title: "Тестовые материалы", templateTitle: "Выполнение работ", versionNumber: 1, status: "DRAFT", updatedAt: "2026-09-18" }] } });
    if (path.endsWith("/deal/files")) return route.fulfill({ json: { dealId: "deal", dealTitle: "Тестовые материалы", dealStatus: "DRAFT", evidenceFiles: files, requirements: [], canUploadEvidence: false, allowedMimeTypes: [] } });
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
  await dialog.getByRole("button", { name: "Следующий файл" }).click();
  expect(await page.evaluate(() => (window as Window & { revoked?: string[] }).revoked?.length)).toBe(1);
  await expect(dialog.getByRole("navigation", { name: "Страницы PDF" })).toContainText("1 из 2");
  await expect(dialog.getByRole("img", { name: "Страница 1" })).toBeVisible();
  await dialog.getByRole("button", { name: "Следующая страница" }).click();
  await expect(dialog.getByRole("img", { name: "Страница 2" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Следующая страница" })).toBeDisabled();
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
  await dialog.getByRole("button", { name: "Следующий файл" }).click();
  await expect(dialog.getByRole("alert")).toContainText("У вас нет доступа");
  await dialog.getByRole("button", { name: "Следующий файл" }).click();
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
