import { expect, test } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

test("four-point edit supports free corners, preview, cancel, original and local-only apply", async ({ browser }) => {
  const context = await actor(browser, 76010, "+79997006010");
  await context.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), urls = new Set<string>();
    Object.assign(window, { testPhotoUrls: urls });
    URL.createObjectURL = value => { const url = create(value); urls.add(url); return url; };
    URL.revokeObjectURL = url => { urls.delete(url); revoke(url); };
  });
  const page = await context.newPage(); await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот", exact: true }).click();
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1500; canvas.height = 1100;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#faf3de"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#3564a3"; ctx.lineWidth = 8; ctx.strokeRect(100, 100, 1300, 900);
    ctx.fillStyle = "#263344"; ctx.font = "45px Arial";
    ["ОБРАЗЕЦ — НЕ ДОКУМЕНТ", "Тест обрезки четырьмя точками", "Верхняя строка", "Средняя строка", "Нижняя строка"].forEach((row, i) => ctx.fillText(row, 140, 220 + i * 140));
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const dialog = page.getByRole("dialog");
  const writes: string[] = [], external: string[] = [];
  page.on("request", request => { if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url()); if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== "http://127.0.0.1:4300") external.push(request.url()); });
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles({ name: "invented.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
  const original = await dialog.getByRole("img", { name: "Фото и личные данные", exact: true }).getAttribute("src");
  await dialog.getByRole("button", { name: "Редактировать: Фото и личные данные", exact: true }).click();
  await expect(dialog.locator(".passport-crop-handle")).toHaveCount(4);
  const upperLeft = dialog.getByRole("button", { name: "Верхний левый угол", exact: true });
  await upperLeft.focus(); await upperLeft.press("Shift+ArrowRight"); await upperLeft.press("Shift+ArrowDown");
  await expect(upperLeft).toHaveAttribute("style", /left: 2.5%; top: 2.5%/);
  const bottomRight = dialog.getByRole("button", { name: "Нижний правый угол", exact: true });
  await bottomRight.scrollIntoViewIfNeeded();
  const button = (await bottomRight.boundingBox())!, bounds = (await dialog.locator(".passport-crop-stage").boundingBox())!;
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .85, bounds.y + bounds.height * .9, { steps: 8 }); await page.mouse.up();
  await expect(bottomRight).not.toHaveAttribute("style", /left: 100%/);
  // Actual touch input exercises pointer capture/touch-action, not just synthetic pointer events.
  if (browser.browserType().name() === "chromium") {
    const touch = await context.newCDPSession(page);
    const upperRight = dialog.getByRole("button", { name: "Верхний правый угол", exact: true });
    const point = (await upperRight.boundingBox())!;
    expect(point.width).toBeGreaterThanOrEqual(44); expect(point.height).toBeGreaterThanOrEqual(44);
    const x = point.x + point.width / 2, y = point.y + point.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 12, y: y + 9 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(upperRight).not.toHaveAttribute("style", /left: 100%/);
    await touch.detach();
  }
  const points = await dialog.locator(".passport-crop-outline polygon").getAttribute("points");
  expect(points).not.toBe("0,0 1,0 1,1 0,1");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 }); await noOverflow(page);
    await dialog.locator(".passport-crop-workspace").scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Посмотреть результат", exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/passport-editor-${width}.png` });
  }
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Результат обрезки", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/passport-editor-preview.png" });
  await dialog.getByRole("button", { name: "Поправить углы", exact: true }).click();
  await expect(dialog.locator(".passport-crop-outline polygon")).toHaveAttribute("points", points!);
  await dialog.getByRole("button", { name: "Отменить редактирование", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Фото и личные данные", exact: true })).toHaveAttribute("src", original!);
  await dialog.getByRole("button", { name: "Редактировать: Фото и личные данные", exact: true }).click();
  await dialog.getByRole("button", { name: "Повернуть", exact: true }).click();
  await expect.poll(() => dialog.locator(".passport-crop-stage canvas").evaluate(el => (el as HTMLCanvasElement).height > (el as HTMLCanvasElement).width)).toBe(true);
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await dialog.getByRole("button", { name: "Использовать фото", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Фото и личные данные", exact: true })).not.toHaveAttribute("src", original!);
  await dialog.getByRole("button", { name: "Редактировать: Фото и личные данные", exact: true }).click();
  await dialog.getByRole("button", { name: "Сбросить углы", exact: true }).click();
  await expect(dialog.locator(".passport-crop-outline polygon")).toHaveAttribute("points", "0,0 1,0 1,1 0,1");
  await dialog.getByRole("button", { name: "Посмотреть результат", exact: true }).click();
  await dialog.getByRole("button", { name: "Отменить редактирование", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Сканирование паспорта", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  expect(await page.evaluate(() => (window as Window & { testPhotoUrls: Set<string> }).testPhotoUrls.size)).toBe(0);
  expect(writes).toEqual([]); expect(external).toEqual([]);
  await context.close();
});

test("invalid editor image reports an error and cancel restores usable scanner", async ({ browser }) => {
  const context = await actor(browser, 76011, "+79997006011");
  const page = await context.newPage(); await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByRole("button", { name: "Считать данные паспорта или загрузить скриншот", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Фото: Фото и личные данные", { exact: true }).setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("invalid pixels") });
  await dialog.getByRole("button", { name: "Редактировать: Фото и личные данные", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Не удалось открыть фотографию");
  await expect(dialog.getByRole("button", { name: "Посмотреть результат", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Отменить редактирование", exact: true }).click();
  await dialog.getByRole("button", { name: "Удалить: Фото и личные данные", exact: true }).click();
  await expect(dialog.getByLabel("Фото: Фото и личные данные", { exact: true })).toBeEnabled();
  await context.close();
});
