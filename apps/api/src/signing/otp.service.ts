import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RedisService } from "../redis/redis.service";
import {
  SMS_PROVIDER,
  type SmsDeliveryChannel,
  type SmsProvider,
} from "./sms.provider";

interface OtpChallenge {
  channel: SmsDeliveryChannel | null;
  digest: string;
  expiresAt: string;
  messageId: string | null;
  phoneId: string;
  versionId: string;
}

export interface IssueOtpInput {
  dealId: string;
  maxUserId: string | null;
  phone: string;
  phoneId: string;
  userId: string;
  versionId: string;
}

export interface IssueOtpResult {
  channel: SmsDeliveryChannel;
  expiresAt: string;
  maskedPhone: string;
  resendAvailableAt: string;
}

export interface VerifyOtpInput {
  code: string;
  dealId: string;
  userId: string;
  versionId: string;
}

export interface VerifiedOtp {
  channel: SmsDeliveryChannel;
  messageId: string | null;
  phoneId: string;
}

@Injectable()
export class OtpService {
  private readonly hmacSecret: string;
  private readonly maxAttempts: number;
  private readonly resendSeconds: number;
  private readonly ttlSeconds: number;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    this.hmacSecret = config.getOrThrow<string>("OTP_HMAC_SECRET");
    this.maxAttempts = config.getOrThrow<number>("OTP_MAX_ATTEMPTS");
    this.resendSeconds = config.getOrThrow<number>("OTP_RESEND_SECONDS");
    this.ttlSeconds = config.getOrThrow<number>("OTP_TTL_SECONDS");
  }

  async issue(input: IssueOtpInput): Promise<IssueOtpResult> {
    const resendKey = this.resendKey(input.dealId, input.userId);
    const allowed = await this.redis.setIfAbsent(resendKey, "1", this.resendSeconds);
    if (!allowed) {
      const retryAfter = Math.max(await this.redis.ttl(resendKey), 1);
      throw new HttpException({
        code: "OTP_RESEND_TOO_SOON",
        details: { retryAfterSeconds: retryAfter },
        message: `Новый код можно запросить через ${retryAfter} сек.`,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = randomInt(0, 10_000).toString().padStart(4, "0");
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1_000);
    const challenge: OtpChallenge = {
      channel: null,
      digest: this.digest(input, code),
      expiresAt: expiresAt.toISOString(),
      messageId: null,
      phoneId: input.phoneId,
      versionId: input.versionId,
    };
    const challengeKey = this.challengeKey(input.dealId, input.userId);
    const attemptsKey = this.attemptsKey(input.dealId, input.userId);
    await this.redis.delete(attemptsKey);
    await this.redis.setWithExpiry(challengeKey, JSON.stringify(challenge), this.ttlSeconds);

    try {
      const delivery = await this.sms.sendOtp({
        code,
        maxUserId: input.maxUserId,
        phone: input.phone,
      });
      challenge.channel = delivery.channel;
      challenge.messageId = delivery.messageId;
      await this.redis.setWithExpiry(challengeKey, JSON.stringify(challenge), this.ttlSeconds);
      return {
        channel: delivery.channel,
        expiresAt: challenge.expiresAt,
        maskedPhone: maskPhone(input.phone),
        resendAvailableAt: new Date(Date.now() + this.resendSeconds * 1_000).toISOString(),
      };
    } catch (error) {
      await Promise.all([
        this.redis.delete(challengeKey),
        this.redis.delete(resendKey),
      ]);
      throw error;
    }
  }

  async verify(input: VerifyOtpInput): Promise<VerifiedOtp> {
    const challengeKey = this.challengeKey(input.dealId, input.userId);
    const raw = await this.redis.get(challengeKey);
    const challenge = parseChallenge(raw);
    if (!challenge || challenge.versionId !== input.versionId) {
      throw expiredCode();
    }
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      await this.redis.delete(challengeKey);
      throw expiredCode();
    }
    const attemptsKey = this.attemptsKey(input.dealId, input.userId);
    const attempt = await this.redis.incrementWithExpiry(attemptsKey, this.ttlSeconds);
    if (attempt > this.maxAttempts) {
      await this.redis.delete(challengeKey);
      throw attemptsExceeded();
    }
    const actual = Buffer.from(this.digest({ ...input, phoneId: challenge.phoneId }, input.code), "hex");
    const expected = Buffer.from(challenge.digest, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      if (attempt >= this.maxAttempts) {
        await this.redis.delete(challengeKey);
        throw attemptsExceeded();
      }
      throw new UnauthorizedException({
        code: "OTP_INVALID",
        details: { attemptsRemaining: this.maxAttempts - attempt },
        message: "Код не подошёл. Проверьте цифры и попробуйте ещё раз",
      });
    }
    if (!challenge.channel) throw expiredCode();
    await Promise.all([
      this.redis.delete(challengeKey),
      this.redis.delete(attemptsKey),
      this.redis.delete(this.resendKey(input.dealId, input.userId)),
    ]);
    return {
      channel: challenge.channel,
      messageId: challenge.messageId,
      phoneId: challenge.phoneId,
    };
  }

  private digest(input: Pick<IssueOtpInput, "dealId" | "phoneId" | "userId" | "versionId">, code: string): string {
    return createHmac("sha256", this.hmacSecret)
      .update([input.dealId, input.userId, input.versionId, input.phoneId, code].join(":"))
      .digest("hex");
  }

  private challengeKey(dealId: string, userId: string): string {
    return `max-contract:signing:otp:${dealId}:${userId}`;
  }

  private attemptsKey(dealId: string, userId: string): string {
    return `${this.challengeKey(dealId, userId)}:attempts`;
  }

  private resendKey(dealId: string, userId: string): string {
    return `${this.challengeKey(dealId, userId)}:resend`;
  }
}

function parseChallenge(raw: string | null): OtpChallenge | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== "object" || value === null ||
      !("digest" in value) || typeof value.digest !== "string" ||
      !("expiresAt" in value) || typeof value.expiresAt !== "string" ||
      !("phoneId" in value) || typeof value.phoneId !== "string" ||
      !("versionId" in value) || typeof value.versionId !== "string"
    ) return null;
    return value as OtpChallenge;
  } catch {
    return null;
  }
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `+${digits.slice(0, 1)} ••• •••-${digits.slice(-4)}` : "••••";
}

function expiredCode(): ConflictException {
  return new ConflictException({
    code: "OTP_EXPIRED",
    message: "Срок действия кода истёк. Запросите новый код",
  });
}

function attemptsExceeded(): HttpException {
  return new HttpException({
    code: "OTP_ATTEMPTS_EXCEEDED",
    message: "Попытки исчерпаны. Запросите новый код",
  }, HttpStatus.TOO_MANY_REQUESTS);
}
