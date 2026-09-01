/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import { ConfigService } from "@nestjs/config";

import { RedisService } from "../redis/redis.service";
import { OtpService } from "./otp.service";
import type { SendOtpInput, SmsProvider } from "./sms.provider";

const input = {
  dealId: "10000000-0000-4000-8000-000000000001",
  maxUserId: "12345",
  phone: "+79991234567",
  phoneId: "20000000-0000-4000-8000-000000000001",
  userId: "30000000-0000-4000-8000-000000000001",
  versionId: "40000000-0000-4000-8000-000000000001",
};

describe("OtpService", () => {
  let redis: MemoryRedis;
  let provider: CapturingSmsProvider;
  let service: OtpService;

  beforeEach(() => {
    redis = new MemoryRedis();
    provider = new CapturingSmsProvider();
    service = new OtpService(
      new ConfigService({
        OTP_HMAC_SECRET: "unit-test-secret",
        OTP_MAX_ATTEMPTS: 5,
        OTP_RESEND_SECONDS: 60,
        OTP_TTL_SECONDS: 300,
      }),
      redis as unknown as RedisService,
      provider,
    );
  });

  it("stores only an HMAC and verifies the exact issued code", async () => {
    const issued = await service.issue(input);
    const code = provider.last?.code ?? "";
    const stored = [...redis.values.values()].find((value) => value.includes("digest")) ?? "";

    expect(code).toMatch(/^\d{4}$/);
    expect(stored).not.toContain(code);
    expect(stored).toMatch(/"digest":"[a-f0-9]{64}"/);
    expect(issued.maskedPhone).toBe("+7 ••• •••-4567");
    await expect(service.verify({
      code,
      dealId: input.dealId,
      userId: input.userId,
      versionId: input.versionId,
    })).resolves.toEqual({ channel: "FAKE", messageId: "test-message", phoneId: input.phoneId });
  });

  it("rate limits resends", async () => {
    await service.issue(input);
    await expect(service.issue(input)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "OTP_RESEND_TOO_SOON" }),
    });
  });

  it("invalidates a challenge after the maximum number of wrong attempts", async () => {
    await service.issue(input);
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(service.verify({
        code: "9999", dealId: input.dealId, userId: input.userId, versionId: input.versionId,
      })).rejects.toMatchObject({ response: expect.objectContaining({ code: "OTP_INVALID" }) });
    }
    await expect(service.verify({
      code: "9999", dealId: input.dealId, userId: input.userId, versionId: input.versionId,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: "OTP_ATTEMPTS_EXCEEDED" }) });
    await expect(service.verify({
      code: provider.last?.code ?? "", dealId: input.dealId, userId: input.userId, versionId: input.versionId,
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: "OTP_EXPIRED" }) });
  });
});

class CapturingSmsProvider implements SmsProvider {
  last: SendOtpInput | null = null;

  async sendOtp(value: SendOtpInput) {
    this.last = value;
    return { channel: "FAKE" as const, messageId: "test-message" };
  }
}

class MemoryRedis {
  readonly values = new Map<string, string>();
  private readonly attempts = new Map<string, number>();

  async delete(key: string): Promise<void> { this.values.delete(key); this.attempts.delete(key); }
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async incrementWithExpiry(key: string): Promise<number> {
    const value = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, value);
    return value;
  }
  async setIfAbsent(key: string, value: string): Promise<boolean> {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }
  async setWithExpiry(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async ttl(): Promise<number> { return 60; }
}
