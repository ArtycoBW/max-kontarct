import { expect, test } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

test("legal Select fits small viewports, traps focus in Dialog and restores the trigger", async ({ browser }) => {
  const context = await actor(browser, 74001, "+79997004001");
  const page = await context.newPage();
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Документы и согласия", exact: true });
  for (const [width, height] of [[320, 568], [390, 740], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const select = dialog.getByRole("combobox", { name: "Выберите документ" });
    await select.click();
    const list = page.getByRole("listbox");
    await expect(page.getByRole("option")).toHaveCount(4);
    // Floating positioning is asynchronous after mounting/resizing the portal.
    await expect.poll(async () => {
      const bounds = await list.boundingBox();
      return Boolean(bounds && bounds.x >= 8 && bounds.x + bounds.width <= width - 8
        && bounds.y >= 8 && bounds.y + bounds.height <= height - 8);
    }).toBe(true);
    await page.screenshot({ path: `test-results/shadcn-select-${width}.png` });
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "Согласие на сервисные уведомления", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("article")).toContainText("Согласие на сервисные уведомления");
    await dialog.getByRole("button", { name: "Понятно" }).focus();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await noOverflow(page);
  }
  await context.close();
});

test("address Command supports keyboard selection, manual input and closing without saving", async ({ browser }) => {
  const context = await actor(browser, 74002, "+79997004002");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.route("**/data-normalization/addresses/suggestions?*", route => route.fulfill({ json: { items: [
    { value: "г. Тестовый, ул. Первая, д. 1", fiasId: null },
    { value: "г. Тестовый, ул. Вторая, д. 2", fiasId: null },
  ] } }));
  let saves = 0;
  page.on("request", req => { if (req.method() === "PATCH" && req.url().endsWith("/profile")) saves++; });
  const address = page.getByRole("combobox", { name: "Адрес регистрации", exact: true });
  await address.fill("Тестовый");
  await expect(page.getByRole("option")).toHaveCount(2);
  await address.press("End"); await address.press("ArrowDown");
  const selected = await page.locator('[cmdk-item][aria-selected="true"]').innerText();
  await address.press("Enter");
  await expect(address).toHaveValue(selected.trim());
  await expect(page.getByRole("listbox")).toBeHidden();
  expect(saves).toBe(0);
  await address.fill("Адрес введён вручную");
  await expect(page.getByRole("option")).toHaveCount(2);
  await address.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(address).toHaveValue("Адрес введён вручную");
  const passport = page.getByRole("button", { name: "Паспортные данные", exact: true });
  await passport.click();
  await expect(passport).toHaveAttribute("aria-expanded", "true");
  await page.getByLabel("Серия паспорта", { exact: true }).fill("0000");
  await passport.click();
  await expect(page.getByLabel("Серия паспорта", { exact: true })).toBeHidden();
  await passport.click();
  await expect(page.getByLabel("Серия паспорта", { exact: true })).toHaveValue("0000");
  await noOverflow(page);
  expect(saves).toBe(0);
  await context.close();
});

test("admin requirements use Dialog, keep drafts unchanged on cancel and restore focus", async ({ browser }) => {
  const context = await actor(browser, 74003, "+79997004003");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  expect((await page.request.post("http://127.0.0.1:4301/_test/admin/74003")).ok()).toBe(true);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Шаблоны", exact: true }).click();
  const card = page.locator(".admin-template-card").first();
  await expect(card).toBeVisible();
  const create = card.getByRole("button", { name: "Создать версию", exact: true });
  if (await create.count()) await create.click();
  const trigger = card.getByRole("button", { name: "Документы", exact: true });
  let originalName = "";
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 740 });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toContainText("Документы · версия");
    const name = dialog.getByLabel("Название", { exact: true }).first();
    if (!originalName) originalName = await name.inputValue();
    await expect(name).toHaveValue(originalName);
    await name.fill("Несохранённая проверка интерфейса");
    await noOverflow(page);
    await page.screenshot({ path: `test-results/shadcn-admin-requirements-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await context.close();
});
