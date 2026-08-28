import { createHmac } from "node:crypto";

import type { MaxContactRequest } from "@max-contract/contracts";

export const TEST_MAX_CONTACT_BOT_TOKEN = "test-max-contact-bot-token";

interface MaxContactFixtureOptions {
  authDate?: number;
  botToken?: string;
  maxUserId?: string;
  phone?: string;
}

export function createMaxContactFixture(
  options: MaxContactFixtureOptions = {},
): MaxContactRequest {
  const authDate = String(
    options.authDate ?? Math.floor(Date.now() / 1_000),
  );
  const maxUserId = options.maxUserId ?? "42001";
  const phone = options.phone ?? "+79991234567";
  const checkString = [
    `authDate=${authDate}`,
    `phone=${phone.replaceAll("+", "")}`,
    `userId=${maxUserId}`,
  ].join("\n");

  return {
    authDate,
    hash: createHmac(
      "sha256",
      options.botToken ?? TEST_MAX_CONTACT_BOT_TOKEN,
    )
      .update(checkString, "utf8")
      .digest("hex"),
    phone,
  };
}
