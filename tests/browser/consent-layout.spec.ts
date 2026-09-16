import type { OnboardingStateResponse } from "@max-contract/contracts";
import { expect, test } from "@playwright/test";

const documents = [
  { type: "PERSONAL_DATA", title: "Обработка персональных данных", card: "Обработка персональных данных" },
  { type: "TERMS_OF_USE", title: "Пользовательские условия / оферта", card: "Условия использования" },
  { type: "STATUS_NOTIFICATIONS", title: "Согласие на сервисные уведомления", card: "Уведомления о статусах" },
  { type: "ELECTRONIC_SIGNATURE", title: "Соглашение о простой электронной подписи", card: "Простая электронная подпись" },
];

for (const width of [320, 390, 1440]) {
  test(`consents have readable cards and independent short reading buttons at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const state: OnboardingStateResponse = {
      completed: false, phone: null, phoneVerified: false, requiredConsentsAccepted: false,
      consents: ["PERSONAL_DATA", "TERMS_OF_USE", "STATUS_NOTIFICATIONS"].map(type => ({ type: type as OnboardingStateResponse["consents"][number]["type"], granted: false, required: type !== "STATUS_NOTIFICATIONS", version: "ui-test" })),
    };
    const submissions: unknown[] = [];
    await page.route("https://st.max.ru/js/max-web-app.js", route => route.fulfill({ contentType: "application/javascript", body: "window.WebApp={initData:'ui-test',initDataUnsafe:{},ready(){window.testMaxUiReady=true},expand(){}};" }));
    // No backend, personal data, real MAX requests or writes are used in this layout test.
    await page.route("**/api/v1/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/auth/me") return route.fulfill({ json: { user: { id: "consent-layout-test", role: "USER", maxAccount: { firstName: "Тест", lastName: "Пользователь", maxUserId: "consent-layout", username: null, languageCode: "ru" } } } });
      if (path === "/api/v1/onboarding") return route.fulfill({ json: state });
      if (path === "/api/v1/public/legal-documents") return route.fulfill({ json: { items: documents.map(({ type, title }) => ({ type, title, status: "DRAFT", version: "ui-test", paragraphs: ["Тестовый текст документа для проверки читаемости интерфейса. Ознакомление не означает принятие условий."] })) } });
      if (path === "/api/v1/onboarding/consents") {
        submissions.push(route.request().postDataJSON());
        return route.fulfill({ json: { ...state, requiredConsentsAccepted: true } });
      }
      return route.fulfill({ status: 503, json: { message: "Unexpected UI test request" } });
    });
    const authenticated = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/auth/me");
    await page.goto("/");
    await authenticated;
    await page.getByRole("button", { name: "Начать работу с Макс-Контракт" }).click();
    const accept = page.getByRole("button", { name: "Принять и продолжить" });
    await expect(accept).toBeDisabled();
    await expect(page.locator(".consent-card")).toHaveCount(4);
    await expect(page.getByText(/^Читать:/)).toHaveCount(0);
    for (const document of documents) {
      const card = page.getByRole("group", { name: document.card, exact: true });
      await card.scrollIntoViewIfNeeded();
      const sizes = await card.evaluate(element => ({
        title: parseFloat(getComputedStyle(element.querySelector("strong")!).fontSize),
        copy: parseFloat(getComputedStyle(element.querySelector("small")!).fontSize),
        overflow: element.scrollWidth > element.clientWidth,
      }));
      expect(sizes.title).toBeGreaterThanOrEqual(16);
      expect(sizes.copy).toBeGreaterThanOrEqual(14);
      expect(sizes.overflow).toBe(false);
      const trigger = card.getByRole("button", { name: "Ознакомиться", exact: true });
      expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("article").getByRole("heading")).toHaveText(document.title);
      expect(await dialog.locator("article p").evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(accept).toBeDisabled();
    }
    expect(submissions).toHaveLength(0);
    for (const document of documents.slice(0, 3)) await expect(page.getByRole("switch", { name: document.card, exact: true })).not.toBeChecked();
    await page.locator(".onboarding-content").evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/consents-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("switch", { name: documents[0]!.card, exact: true }).check();
    await expect(accept).toBeDisabled();
    await page.getByRole("switch", { name: documents[1]!.card, exact: true }).check();
    await expect(accept).toBeEnabled();
    await accept.click();
    await expect(page.getByRole("heading", { name: "Ваш номер телефона" })).toBeVisible();
    expect(submissions).toEqual([{ personalData: true, statusNotifications: false, termsOfUse: true }]);
  });
}
