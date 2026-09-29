import { invitationShareText, INVITATION_SHARE_BUDGET_BYTES } from "./invitation-share-text";

const link = "https://www.example.test/invite/AbCdEfGhIjKl#0123456789abcdefghijklmnopqrstuv";
const bytes = (text: string) => new TextEncoder().encode(text).length;
describe("compact native invitation payload", () => {
  it("keeps the subject and amount instead of sending long boilerplate", () => {
    const text = "Артур приглашает вас в сделку «Макс-Контракт».\n\nПредмет: Презентация на 10 слайдов\n\nСтоимость: 10 000 ₽\n\nОписание и основные условия — по защищённой ссылке. Не пересылайте приглашение посторонним.\n\nПереход по ссылке не означает согласие с условиями или подписание договора.";
    const short = invitationShareText(text, link);
    expect(short).toContain("Презентация на 10 слайдов");
    expect(short).toContain("10 000 ₽");
    expect(bytes(`${short}\n${link}`)).toBeLessThanOrEqual(INVITATION_SHARE_BUDGET_BYTES);
  });
  it.each(["Я".repeat(2000), "📊".repeat(2000), "é".repeat(2000), " ".repeat(1000)])("bounds UTF-8 bytes without cutting surrogate pairs", subject => {
    const short = invitationShareText(`Предмет: ${subject}\nСтоимость: 10000 ₽`, link);
    expect(bytes(`${short}\n${link}`)).toBeLessThanOrEqual(INVITATION_SHARE_BUDGET_BYTES);
    expect(short).not.toMatch(/[\uD800-\uDFFF]/u);
  });
  it("does not duplicate an existing URL and leaves short messages alone", () => {
    expect(invitationShareText(`Привет\n${link}`, link)).toBe("Привет");
    expect(invitationShareText("Привет", link)).toBe("Привет");
    expect(invitationShareText("", link)).toBe("");
  });
  it("drops all extra text for unusually long URLs", () => {
    expect(invitationShareText("Приглашение", `${link}${"a".repeat(300)}`)).toBe("");
  });
});
