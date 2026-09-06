import { ConfigService } from "@nestjs/config";
import { SmscSmsProvider } from "./smsc-sms.provider";

const settings = { SMSC_API_KEY: "private-key", SMSC_API_URL: "https://smsc.ru", SMSC_LOGIN: "private-login", SMSC_PASSWORD: "private-password", SMSC_SENDER: "TEST", SMSC_TIMEOUT_MS: 1000 };
const input = { phone: "+79997001300", code: "123456", maxUserId: null };
describe("SMSC adapter", () => {
  afterEach(() => jest.restoreAllMocks());
  it("sends UTF-8 JSON with the API key and an abort deadline", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: 123 }), { status: 200 }));
    expect(await new SmscSmsProvider(new ConfigService(settings)).sendOtp(input)).toEqual({ channel: "SMSC", messageId: "123" });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://smsc.ru/rest/send/");
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const body: unknown = JSON.parse(typeof request?.body === "string" ? request.body : "{}");
    expect(body).toEqual({ apikey: "private-key", phones: "79997001300", mes: "Код подписания Макс-Контракт: 123456", sender: "TEST" });
    expect(body).not.toHaveProperty("psw");
  });
  it("supports legacy credentials without sending an empty sender", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "123" })));
    await new SmscSmsProvider(new ConfigService({ ...settings, SMSC_API_KEY: "", SMSC_SENDER: "" })).sendOtp(input);
    const body = fetcher.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(typeof body === "string" ? body : "{}")).toEqual({ login: "private-login", psw: "private-password", phones: "79997001300", mes: "Код подписания Макс-Контракт: 123456" });
  });
  it.each([
    [200, { error_code: 2, error: "private-key" }], [403, { id: 123 }],
    [200, { id: "" }], [200, { id: 0 }], [200, { id: 123, error: "provider rejected private-key" }],
    [200, null], [200, []], [200, { id: true }],
  ])("maps unusable response %s/%j to a safe error", async (status, body) => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
    await expect(new SmscSmsProvider(new ConfigService(settings)).sendOtp(input)).rejects.toMatchObject({ response: { code: "OTP_DELIVERY_UNAVAILABLE", message: "Сервис SMS временно недоступен" } });
  });
  it("handles malformed JSON", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("not-json private-key"));
    await expect(new SmscSmsProvider(new ConfigService(settings)).sendOtp(input)).rejects.toThrow("Сервис SMS временно недоступен");
  });
  it("does not leak timeout or transport details", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("private-key transport timeout"));
    await expect(new SmscSmsProvider(new ConfigService(settings)).sendOtp(input)).rejects.toThrow("Сервис SMS временно недоступен");
  });
});
