import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { VerifiedMaxLaunch, VerifiedMaxUser } from "./auth.types";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const INTEGER_PATTERN = /^\d+$/;
const MAX_PARAMETER_COUNT = 64;

function unauthorized(code: string, message: string): UnauthorizedException {
  return new UnauthorizedException({ code, message });
}

@Injectable()
export class MaxInitDataVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(
    initData: string,
    nowSeconds = Math.floor(Date.now() / 1_000),
  ): VerifiedMaxLaunch {
    const params = this.parseParameters(initData);
    const originalHash = params.get("hash");

    if (!originalHash || !HASH_PATTERN.test(originalHash)) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
    }

    const botToken = this.config.getOrThrow<string>("MAX_BOT_TOKEN").trim();
    if (!botToken) {
      throw unauthorized(
        "MAX_AUTH_NOT_CONFIGURED",
        "Авторизация MAX пока недоступна",
      );
    }

    const launchParams = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken, "utf8")
      .digest();
    const expectedHash = createHmac("sha256", secretKey)
      .update(launchParams, "utf8")
      .digest();
    const suppliedHash = Buffer.from(originalHash, "hex");

    if (
      suppliedHash.length !== expectedHash.length ||
      !timingSafeEqual(suppliedHash, expectedHash)
    ) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
    }

    const authDate = this.parseAuthDate(params.get("auth_date"));
    const ttlSeconds = this.config.getOrThrow<number>("MAX_INIT_DATA_TTL_SECONDS");
    const futureSkewSeconds = this.config.getOrThrow<number>(
      "MAX_INIT_DATA_FUTURE_SKEW_SECONDS",
    );

    if (authDate > nowSeconds + futureSkewSeconds) {
      throw unauthorized(
        "MAX_INIT_DATA_INVALID",
        "Некорректное время данных запуска MAX",
      );
    }

    if (nowSeconds - authDate > ttlSeconds) {
      throw unauthorized("MAX_INIT_DATA_EXPIRED", "Данные запуска MAX устарели");
    }

    const queryId = params.get("query_id");
    if (!queryId || queryId.length > 256) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
    }

    return {
      authDate,
      expiresAt: authDate + ttlSeconds,
      queryId,
      user: this.parseUser(params.get("user")),
    };
  }

  private parseParameters(initData: string): Map<string, string> {
    const segments = initData.split("&");
    if (segments.length === 0 || segments.length > MAX_PARAMETER_COUNT) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
    }

    const params = new Map<string, string>();

    for (const segment of segments) {
      const separator = segment.indexOf("=");
      if (separator <= 0) {
        throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
      }

      const key = segment.slice(0, separator);
      if (params.has(key)) {
        throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
      }

      try {
        params.set(
          key,
          decodeURIComponent(segment.slice(separator + 1).replace(/\+/g, " ")),
        );
      } catch {
        throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
      }
    }

    return params;
  }

  private parseAuthDate(value: string | undefined): number {
    if (!value || !INTEGER_PATTERN.test(value)) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректные данные запуска MAX");
    }

    return parsed;
  }

  private parseUser(value: string | undefined): VerifiedMaxUser {
    if (!value) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Профиль MAX отсутствует");
    }

    let user: unknown;
    try {
      user = JSON.parse(value);
    } catch {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
    }

    if (typeof user !== "object" || user === null || Array.isArray(user)) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
    }

    const record = user as Record<string, unknown>;
    const maxUserId = this.readUserId(record.id);
    const firstName = this.readRequiredString(record.first_name, 128);

    return {
      firstName,
      languageCode: this.readOptionalString(record.language_code, 16),
      lastName: this.readOptionalString(record.last_name, 128),
      maxUserId,
      username: this.readOptionalString(record.username, 128),
    };
  }

  private readUserId(value: unknown): string {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
      }
      return String(value);
    }

    if (
      typeof value !== "string" ||
      !INTEGER_PATTERN.test(value) ||
      value.length > 128
    ) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
    }

    return value;
  }

  private readRequiredString(value: unknown, maxLength: number): string {
    const parsed = this.readOptionalString(value, maxLength);
    if (!parsed) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
    }
    return parsed;
  }

  private readOptionalString(value: unknown, maxLength: number): string | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string") {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
    }

    const parsed = value.trim();
    if (!parsed || parsed.length > maxLength) {
      throw unauthorized("MAX_INIT_DATA_INVALID", "Некорректный профиль MAX");
    }

    return parsed;
  }
}
