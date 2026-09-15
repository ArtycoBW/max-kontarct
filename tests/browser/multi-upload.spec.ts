import { expect, test } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

test("multiple files keep successes, retry only failures and support larger materials", async ({ browser }) => {
  const context = await actor(browser, 72401, "+79997002401");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  const template = await (await page.request.get("/api/v1/templates/paid-services")).json();
  const created = await page.request.post("/api/v1/deals", { data: {
    creationPath: "TEMPLATE", description: "Подготовить иллюстрации", title: "Проверка нескольких файлов", templateVersionId: template.currentVersion.id,
  } });
  expect(created.ok()).toBe(true);
  const deal = await created.json();
  const url = `/api/v1/deals/${deal.id}/files`;
  const workspace = await (await page.request.get(url)).json();
  expect(workspace).toMatchObject({ maxUploadBytes: 104857600, maxEvidenceUploadBytes: 262144000 });
  // API seeding intentionally bypasses React Query; open a fresh client cache.
  await page.reload();
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page.getByRole("button", { name: /Проверка нескольких файлов/ }).click();
  const materials = page.locator(".documents-section").filter({ hasText: "Материалы и доказательства" });
  await expect(materials.getByRole("button", { name: "Добавить материалы" })).toBeVisible();
  await expect(page.locator(".documents-screen")).not.toContainText(/(?:20|100|250)\s*МБ/);
  let failedOnce = false;
  const uploads: string[] = [];
  await page.route(`**${url}`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataBuffer()!.toString("utf8");
    const name = body.match(/filename="([^"]+)"/)?.[1] ?? "";
    uploads.push(name);
    if (name === "second.pdf" && !failedOnce) {
      failedOnce = true;
      return route.fulfill({ status: 503, json: { message: "Хранилище временно недоступно" } });
    }
    return route.continue();
  });
  await materials.locator('input[type="file"]').setInputFiles(["first.pdf", "second.pdf", "third.pdf"].map(name => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 synthetic") })));
  await expect(page.locator(".upload-failures")).toContainText("second.pdf");
  await expect(materials.locator(".uploaded-file-list a")).toHaveCount(2);
  await page.getByRole("button", { name: "Повторить неудавшиеся" }).click();
  await expect(materials.locator(".uploaded-file-list a")).toHaveCount(3);
  await expect(page.locator(".upload-failures")).toHaveCount(0);
  expect(uploads).toEqual(["first.pdf", "second.pdf", "third.pdf", "second.pdf"]);
  for (const width of [320, 390, 1440]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(page); }
  // Synthetic content only; confirms the old 20 MB transport boundary is gone.
  const large = Buffer.alloc(21 * 1024 * 1024); large.write("%PDF-1.7");
  const uploaded = await page.request.post(url, { multipart: { category: "EVIDENCE", file: { name: "large.pdf", mimeType: "application/pdf", buffer: large } } });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  expect((await uploaded.json()).sizeBytes).toBe(large.length);
  await context.close();
});
