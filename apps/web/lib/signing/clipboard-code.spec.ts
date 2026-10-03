import { signatureCodeFromClipboard } from "./clipboard-code";

describe("signatureCodeFromClipboard", () => {
  it.each(["1234", " 0123 \n", "Код подписания Макс-Контракт: 1234. Никому не сообщайте его.", "Тестовый код подписания Макс-Контракт: 1234. Никому не сообщайте его."])("accepts a code or our notification: %s", value => {
    expect(signatureCodeFromClipboard(value)).toBe(value.includes("0123") ? "0123" : "1234");
  });
  it.each(["", "123", "12345", "+79991234567", "Договор № 1234", "Код подписания Макс-Контракт: 12345"])("does not paste unrelated numbers: %s", value => {
    expect(signatureCodeFromClipboard(value)).toBeNull();
  });
});
