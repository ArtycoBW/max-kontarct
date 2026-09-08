import { expect, test } from "@playwright/test";
import { actor, noOverflow, onboarding } from "./helpers";

test("free description prefills a matching template and survives draft reload", async ({ browser }) => {
  const context = await actor(browser, 71900, "+79997001900");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await page.getByRole("textbox", { name: "Что хотите оформить?" }).fill("Подготовить презентацию на 10 слайдов за 15 000 рублей до 2099-09-20");
  await page.getByRole("button", { name: "Подобрать договор с ИИ" }).click();
  const proposal = page.getByRole("region", { name: "Предложение ИИ" });
  await expect(proposal).toContainText("Оказание услуг");
  await expect(proposal).toContainText("15000");
  await expect(proposal).toContainText("20.09.2099");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow(page);
    await page.screenshot({ path: `test-results/deal-intake-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Проверить и продолжить" }).click();
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await expect(page.getByRole("textbox", { name: "Стоимость услуги, ₽", exact: true })).toHaveValue("15000");
  await expect(page.getByRole("textbox", { name: "Описание услуги", exact: true })).toHaveValue(/Подготовить презентацию/);
  await page.reload();
  await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
  // Reopen the saved draft from the user's workspace (the shell starts on Home).
  await page.getByRole("button", { name: "Сделки", exact: true }).click();
  await page.getByRole("button", { name: /Проект по описанию/ }).first().click();
  await page.getByRole("button", { name: "Редактировать черновик" }).click();
  await expect(page.getByRole("textbox", { name: "Стоимость услуги, ₽", exact: true })).toHaveValue("15000");
  await context.close();
});

test("no catalog match leads to an individual project and generation", async ({ browser }) => {
  const context = await actor(browser, 71901, "+79997001901");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const description = "Хочу обменять фотоаппарат на велосипед без доплаты";
  await page.getByRole("textbox", { name: "Поиск типа сделки" }).fill(description);
  await page.getByRole("button", { name: "Использовать этот текст для ИИ" }).click();
  await expect(page.getByRole("textbox", { name: "Что хотите оформить?" })).toHaveValue(description);
  await page.getByRole("button", { name: "Подобрать договор с ИИ" }).click();
  await expect(page.getByRole("region", { name: "Предложение ИИ" })).toContainText("Индивидуальный проект");
  await page.getByRole("button", { name: "Проверить и продолжить" }).click();
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await page.getByRole("textbox", { name: "Обязанности инициатора", exact: true }).fill("Передать свой фотоаппарат в исправном состоянии");
  await page.getByRole("textbox", { name: "Обязанности второй стороны", exact: true }).fill("Передать свой велосипед в исправном состоянии");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("button", { name: "Подготовить договор" }).click();
  await expect(page.getByRole("button", { name: "Проверить свои данные" })).toBeVisible();
  await expect(page.getByText(/Индивидуальный проект подготовлен ИИ/)).toBeVisible();
  await context.close();
});

test("AI failure retains the description and permits retry or manual selection", async ({ browser }) => {
  const context = await actor(browser, 71902, "+79997001902");
  const page = await context.newPage();
  await page.goto("/"); await onboarding(page);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await page.route("**/api/v1/deal-intake", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "DEAL_INTAKE_UNAVAILABLE", message: "Не удалось разобрать описание. Повторите попытку." }) }));
  const description = "Нужна консультация по дизайну";
  await page.getByRole("textbox", { name: "Что хотите оформить?" }).fill(description);
  await page.getByRole("button", { name: "Подобрать договор с ИИ" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось разобрать описание" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Что хотите оформить?" })).toHaveValue(description);
  await page.unroute("**/api/v1/deal-intake");
  await page.getByRole("button", { name: "Подобрать договор с ИИ" }).click();
  await expect(page.getByRole("region", { name: "Предложение ИИ" })).toBeVisible();
  await context.close();
});
