import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { MaxContactDto } from "./dto/max-contact.dto";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const INTEGER_PATTERN = /^\d+$/;
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

function contactUnauthorized(code: string, message: string) {
  return new UnauthorizedException({ code, message });
}

@Injectable()
export class MaxContactVerifier {
  constructor(private readonly config: ConfigService) {}

  verify(
    contact: MaxContactDto,
    maxUserId: string,
    nowSeconds = Math.floor(Date.now() / 1_000),
  ): string {
    const botToken = this.config.getOrThrow<string>("MAX_BOT_TOKEN").trim();
    if (!botToken) {
      throw new ServiceUnavailableException({
        code: "MAX_CONTACT_NOT_CONFIGURED",
        message: "Подтверждение телефона через MAX пока недоступно",
      });
    }

    if (!HASH_PATTERN.test(contact.hash)) {
      throw contactUnauthorized(
        "MAX_CONTACT_INVALID",
        "Некорректное подтверждение телефона MAX",
      );
    }

    const authDate = this.parseAuthDate(contact.authDate);
    this.verifyFreshness(authDate, nowSeconds);

    const phone = contact.phone.trim();
    if (!PHONE_PATTERN.test(phone)) {
      throw contactUnauthorized(
        "MAX_CONTACT_INVALID",
        "Некорректный номер телефона MAX",
      );
    }

    const checkString = [
      `authDate=${contact.authDate}`,
      `phone=${phone.replaceAll("+", "")}`,
      `userId=${maxUserId}`,
    ].join("\n");
    const expectedHash = createHmac("sha256", botToken)
      .update(checkString, "utf8")
      .digest();
    const suppliedHash = Buffer.from(contact.hash, "hex");

    if (
      suppliedHash.length !== expectedHash.length ||
      !timingSafeEqual(suppliedHash, expectedHash)
    ) {
      throw contactUnauthorized(
        "MAX_CONTACT_INVALID",
        "Некорректное подтверждение телефона MAX",
      );
    }

    return normalizePhone(phone);
  }

  private parseAuthDate(value: string): number {
    if (!INTEGER_PATTERN.test(value)) {
      throw contactUnauthorized(
        "MAX_CONTACT_INVALID",
        "Некорректное время подтверждения телефона MAX",
      );
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
      throw contactUnauthorized(
        "MAX_CONTACT_INVALID",
        "Некорректное время подтверждения телефона MAX",
      );
    }
    // MAX clients currently return the contact proof timestamp in
    // milliseconds, while older clients and fixtures use Unix seconds.
    // Keep the original string for HMAC verification and normalize only the
    // value used by the freshness check.
    return value.length === 13 ? Math.floor(parsed / 1_000) : parsed;
  }

  private verifyFreshness(authDate: number, nowSeconds: number): void {
    const futureSkew = this.config.getOrThrow<number>(
      "MAX_CONTACT_FUTURE_SKEW_SECONDS",
    );
    const ttl = this.config.getOrThrow<number>("MAX_CONTACT_TTL_SECONDS");

    if (authDate > nowSeconds + futureSkew) {
      throw contactUnauthorized(
        "MAX_CONTACT_INVALID",
        "Некорректное время подтверждения телефона MAX",
      );
    }

    if (nowSeconds - authDate > ttl) {
      throw contactUnauthorized(
        "MAX_CONTACT_EXPIRED",
        "Подтверждение телефона MAX устарело",
      );
    }
  }
}

export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `7${digits}`;
  } else if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw contactUnauthorized(
      "MAX_CONTACT_INVALID",
      "Некорректный номер телефона MAX",
    );
  }

  return `+${digits}`;
}
