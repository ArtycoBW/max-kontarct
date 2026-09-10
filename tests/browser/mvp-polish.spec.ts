import { expect, test, type Page } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

test("smooth start keeps card size stable and legal modal chrome stays visible on small screens", async ({ browser }) => {
  const context = await actor(browser, 73011, "+79997003011");
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const card = page.locator(".start-screen-copy");
  await expect(card).toBeVisible();
  const height = (await card.boundingBox())!.height;
  await expect(page.locator(".start-screen-canvas")).toHaveCSS("opacity", "1");
  const initialFrame = await page.locator(".start-screen-canvas").evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  for (const title of ["Подпишите и сохраните", "Опишите свою сделку"]) {
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect(Math.abs((await card.boundingBox())!.height - height)).toBeLessThan(1);
    await expect(page.locator(".start-screen-canvas")).toHaveCSS("opacity", "1");
    if (title === "Подпишите и сохраните") await expect.poll(() => page.locator(".start-screen-canvas").evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(initialFrame);
  }
  await page.getByRole("button", { name: "Документы и согласия", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    await noOverflow(page);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8); expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.y + box.height).toBeLessThanOrEqual(633);
    await dialog.locator(".app-modal-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByRole("button", { name: "Закрыть окно" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Понятно" })).toBeInViewport();
    await expect(dialog).not.toContainText(/Проект · версия|stage-pep-v1|2026-08-29-v1/);
    await page.screenshot({ path: `test-results/legal-polish-${width}.png` });
  }
  await page.keyboard.press("Escape");
  await context.close();
});

test("speech is opt-in, preserves manual edits, handles denial and unsupported WebViews", async ({ browser }) => {
  const context = await actor(browser, 73012, "+79997003012");
  await context.addInitScript(() => {
    const state = window as unknown as { SpeechRecognition: unknown; webkitSpeechRecognition?: unknown; speech?: unknown; starts: number };
    state.starts = 0;
    state.SpeechRecognition = class {
      onstart?: () => void; onend?: () => void;
      constructor() { state.speech = this; }
      start() { state.starts++; this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
  const page = await context.newPage(); await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const field = page.getByRole("textbox", { name: "Что хотите оформить?" });
  await field.fill("Нужна презентация.");
  await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { starts: number }).starts)).toBe(0);
  await expect(page.getByRole("dialog")).toContainText("аудио может передаваться");
  await page.getByRole("button", { name: "Включить микрофон", exact: true }).click();
  const emit = async (text: string, isFinal: boolean) => page.evaluate(({ text, isFinal }) => {
    (window as unknown as { speech: { onresult: (e: unknown) => void } }).speech.onresult({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  }, { text, isFinal });
  await emit("На десять слайдов.", false); await expect(field).toHaveValue("Нужна презентация. На десять слайдов.");
  await emit("На десять слайдов.", true); await emit("На десять слайдов.", true);
  await expect(field).toHaveValue("Нужна презентация. На десять слайдов.");
  await field.fill("Правка вручную."); await emit("не затирать", true);
  await expect(field).toHaveValue("Правка вручную.");
  await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
  await page.evaluate(() => (window as unknown as { speech: { onerror: (e: unknown) => void } }).speech.onerror({ error: "not-allowed" }));
  await expect(page.getByText(/Доступ к микрофону или распознаванию запрещён/)).toBeVisible();
  await page.evaluate(() => { const state = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; delete state.SpeechRecognition; delete state.webkitSpeechRecognition; });
  await page.getByRole("button", { name: "Продиктовать", exact: true }).click();
  await expect(page.getByText(/версии MAX голосовое распознавание недоступно/)).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 }); await noOverflow(page);
    const text = (await field.boundingBox())!, meta = (await page.locator(".deal-intake-panel .field-meta").boundingBox())!;
    expect(meta.x - text.x).toBeGreaterThanOrEqual(10); expect(text.x + text.width - meta.x - meta.width).toBeGreaterThanOrEqual(8);
    await page.screenshot({ path: `test-results/intake-polish-${width}.png` });
  }
  await context.close();
});

async function specimen(page: Page, lines: string[]) {
  // Deliberately synthetic, not an identity document. Raster pixels exercise real WASM OCR.
  const base64 = await page.evaluate(lines => {
    const canvas = document.createElement("canvas"); canvas.width = 1500; canvas.height = 1200;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1500, 1200);
    ctx.fillStyle = "#000"; ctx.font = "40px Arial";
    lines.forEach((line, index) => ctx.fillText(line, 100, 100 + index * 95));
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, lines);
  return { name: "synthetic-ocr-test.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

test("real local passport OCR: three images, review before persistence, private profile, cancellation", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await actor(browser, 73013, "+79997003013");
  const page = await context.newPage(); await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  const before = await (await page.request.get("/api/v1/profile")).json();
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ", "ФАМИЛИЯ ПРИМЕРОВ", "ИМЯ ИВАН", "ОТЧЕСТВО ИВАНОВИЧ", "ДАТА РОЖДЕНИЯ 01.02.1990", "ПОЛ МУЖ.", "МЕСТО РОЖДЕНИЯ Г. ПРИМЕР", "СЕРИЯ НОМЕР", "00 00 000000"]));
  await dialog.getByLabel("Фото: Кем выдан паспорт", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ", "ПАСПОРТ ВЫДАН", "ТЕСТОВЫМ ОТДЕЛОМ", "ДАТА ВЫДАЧИ 02.03.2010", "КОД ПОДРАЗДЕЛЕНИЯ 000-000"]));
  await dialog.getByLabel("Фото: Регистрация", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ", "ЗАРЕГИСТРИРОВАН", "Г. ПРИМЕР", "УЛ. ТЕСТОВАЯ, Д. 1, КВ. 2", "ПОДПИСЬ СОТРУДНИКА"]));
  const writes: string[] = [], external: string[] = [];
  page.on("request", req => { if (["POST", "PUT", "PATCH"].includes(req.method())) writes.push(req.url()); if (!req.url().startsWith("http://127.0.0.1:4300") && /^https?:/.test(req.url())) external.push(req.url()); });
  await dialog.getByRole("button", { name: "Распознать данные", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Проверьте данные", exact: true })).toBeVisible({ timeout: 160_000 });
  expect(writes).toEqual([]); expect(external).toEqual([]);
  await expect(dialog.getByLabel("Фамилия", { exact: true })).toHaveValue("Примеров");
  await expect(dialog.getByLabel("Имя", { exact: true })).toHaveValue("Иван");
  await expect(dialog.getByLabel("Дата рождения", { exact: true })).toHaveText("01.02.1990");
  await expect(dialog.getByLabel("Дата выдачи", { exact: true })).toHaveText("02.03.2010");
  // Calendar and its month Select must remain interactive inside the Dialog portal.
  await dialog.getByLabel("Дата выдачи", { exact: true }).click();
  await page.getByRole("combobox", { name: "Месяц", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(12);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Проверьте данные" })).toBeVisible();
  await expect(dialog.getByLabel("Код подразделения", { exact: true })).toHaveValue("000-000");
  await expect(dialog.getByLabel("Адрес регистрации", { exact: true })).toHaveValue(/Г. ПРИМЕР.*ТЕСТОВАЯ/);
  await expect(dialog.getByRole("button", { name: "Перенести в профиль" })).toBeDisabled();
  await dialog.getByLabel("Фамилия", { exact: true }).press("Enter");
  expect(writes).toEqual([]);
  expect((await (await page.request.get("/api/v1/profile")).json()).passport).toEqual(before.passport);
  await dialog.getByLabel("Я проверил данные по паспорту").check();
  await expect(dialog.getByLabel("Я проверил данные по паспорту")).toHaveAttribute("data-state", "checked");
  await page.screenshot({ path: "test-results/ocr-review.png" });
  await dialog.getByRole("button", { name: "Перенести в профиль" }).click();
  expect((await (await page.request.get("/api/v1/profile")).json()).firstName).toBe(before.firstName);
  await page.getByRole("button", { name: "Сохранить профиль", exact: true }).click();
  await expect(page.getByText("Изменения сохранены", { exact: true })).toBeVisible();
  const saved = await (await page.request.get("/api/v1/profile")).json();
  expect(saved).toMatchObject({ firstName: "Иван", lastName: "Примеров", birthDate: "1990-02-01", passport: { divisionCode: "000-000", issuedAt: "2010-03-02" } });
  expect(JSON.stringify(saved)).not.toMatch(/data:image|rawText|synthetic-ocr-test/);
  await page.reload(); await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await expect(page.getByLabel("Имя", { exact: true })).toHaveValue("Иван");
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await dialog.getByRole("button", { name: "Распознать данные", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Удалить: Фото и личные данные" }).click();
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ"]));
  await dialog.getByRole("button", { name: "Распознать данные", exact: true }).click();
  await dialog.getByRole("button", { name: "Отменить распознавание", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Распознать данные", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get("http://127.0.0.1:4300/api/v1/profile")).status()).toBe(401);
  expect((await anonymous.request.patch("http://127.0.0.1:4300/api/v1/profile", { data: { firstName: "Чужой", lastName: "Запрос", passport: null } })).status()).toBe(401);
  await anonymous.close();
  const other = await actor(browser, 73015, "+79997003015");
  const otherPage = await other.newPage(); await otherPage.goto("/"); await onboarding(otherPage);
  expect((await (await otherPage.request.get("/api/v1/profile")).json()).passport).toBeNull();
  await other.close();
  expect((await page.request.patch("/api/v1/profile", { data: { firstName: "Иван", lastName: "Примеров", passport: null } })).ok()).toBe(true);
  expect((await (await page.request.get("/api/v1/profile")).json()).passport).toBeNull();
  await context.close();
});

test("OCR releases the worker on a model failure and on cancellation during loading", async ({ browser }) => {
  const context = await actor(browser, 73014, "+79997003014");
  const page = await context.newPage(); await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ"]));
  // Native Worker fetches are also routed by the context.
  await context.route("**/ocr/lang/*.traineddata.gz", route => route.fulfill({ status: 503, body: "model unavailable" }));
  let closed = 0;
  page.on("worker", worker => worker.on("close", () => closed++));
  await dialog.getByRole("button", { name: "Распознать данные", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось загрузить модуль", { timeout: 30_000 });
  await expect.poll(() => closed).toBe(1);
  await context.unroute("**/ocr/lang/*.traineddata.gz");
  let unblock: () => void = () => {};
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  await context.route("**/ocr/core/**", async route => { await gate; await route.abort().catch(() => {}); });
  await dialog.getByRole("button", { name: "Распознать данные", exact: true }).click();
  await dialog.getByRole("button", { name: "Отменить распознавание", exact: true }).click();
  await expect.poll(() => closed).toBe(2);
  await expect(dialog.getByRole("button", { name: "Распознать данные", exact: true })).toBeEnabled();
  unblock();
  await context.close();
});

test("passport OCR review groups inline issues and clears them after manual correction", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await actor(browser, 73016, "+79997003016");
  const page = await context.newPage(); await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByRole("button", { name: "Считать данные паспорта", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ", "ИМЯ ИВАН", "ДАТА РОЖДЕНИЯ 01.02.1990", "ПОЛ МУЖ."]));
  await dialog.getByLabel("Фото: Регистрация", { exact: true }).setInputFiles(await specimen(page, ["ОБРАЗЕЦ ДЛЯ ТЕСТИРОВАНИЯ", "ЗАРЕГИСТРИРОВАН", "Г. ПРИМЕР"]));
  const writes: string[] = [];
  page.on("request", request => { if (["POST", "PATCH", "PUT"].includes(request.method())) writes.push(request.url()); });
  await dialog.getByRole("button", { name: "Распознать данные", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Проверьте данные" })).toBeVisible({ timeout: 160_000 });
  await expect(dialog.getByRole("status")).toHaveCount(1);
  await expect(dialog.getByRole("status")).toContainText(/Заполнено \d+ из \d+ полей/);
  await expect(dialog.locator("fieldset")).toHaveCount(3);
  await expect(dialog).not.toContainText(/Некоторые фрагменты|Результаты распознавания расходятся|ФИО распознано не полностью/);
  const surname = dialog.getByLabel("Фамилия", { exact: true });
  await expect(surname).toHaveAttribute("aria-invalid", "true");
  await expect(surname).toHaveAttribute("aria-describedby", "ocr-hint-lastName");
  await dialog.getByRole("button", { name: "К первому полю" }).click();
  await expect(surname).toBeFocused();
  await surname.fill("Примеров");
  await expect(surname).toHaveAttribute("aria-invalid", "false");
  await expect(dialog.locator("#ocr-hint-lastName")).toHaveCount(0);
  await surname.fill("");
  await expect(dialog.locator("#ocr-hint-lastName")).toBeVisible();
  const address = dialog.getByLabel("Адрес регистрации", { exact: true });
  await expect(dialog.locator("#ocr-hint-address")).toContainText("Прочитан не весь адрес");
  await address.fill("Г. ПРИМЕР, УЛ. ТЕСТОВАЯ, Д. 1");
  await expect(dialog.locator("#ocr-hint-address")).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 }); await noOverflow(page);
    await dialog.locator(".app-modal-body").evaluate(element => { element.scrollTop = 0; });
    await expect(dialog.getByRole("button", { name: "Закрыть окно" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Перенести в профиль" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Перенести в профиль" })).toBeDisabled();
    await page.screenshot({ path: `test-results/ocr-structured-review-${width}.png` });
  }
  expect(writes).toEqual([]);
  await context.close();
});
