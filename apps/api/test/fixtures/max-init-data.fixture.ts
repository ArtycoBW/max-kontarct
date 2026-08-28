import { createHmac } from "node:crypto";

export const TEST_MAX_BOT_TOKEN = "test-max-bot-token-for-fixtures";

export interface MaxInitDataFixtureOptions {
  authDate?: number;
  botToken?: string;
  firstName?: string;
  maxUserId?: number;
  queryId?: string;
  username?: string;
}

export function createMaxInitDataFixture(
  options: MaxInitDataFixtureOptions = {},
): string {
  const authDate = options.authDate ?? Math.floor(Date.now() / 1_000);
  const params = new Map<string, string>([
    ["auth_date", String(authDate)],
    ["query_id", options.queryId ?? `query-${authDate}`],
    [
      "user",
      JSON.stringify({
        first_name: options.firstName ?? "Иван",
        id: options.maxUserId ?? 10_001,
        language_code: "ru",
        last_name: "Тестовый",
        username: options.username ?? "max_fixture_user",
      }),
    ],
  ]);
  const launchParams = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(options.botToken ?? TEST_MAX_BOT_TOKEN, "utf8")
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(launchParams, "utf8")
    .digest("hex");

  return [...params.entries(), ["hash", hash] as const]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}
