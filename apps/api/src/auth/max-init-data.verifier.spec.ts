import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  createMaxInitDataFixture,
  TEST_MAX_BOT_TOKEN,
} from "../../test/fixtures/max-init-data.fixture";
import { MaxInitDataVerifier } from "./max-init-data.verifier";

describe("MaxInitDataVerifier", () => {
  const nowSeconds = 2_000_000_000;
  const configValues: Record<string, unknown> = {
    MAX_BOT_TOKEN: TEST_MAX_BOT_TOKEN,
    MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
    MAX_INIT_DATA_TTL_SECONDS: 3_600,
  };
  const config = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const verifier = new MaxInitDataVerifier(config);

  it("verifies an authentic MAX fixture with the documented nested HMAC", () => {
    const result = verifier.verify(
      createMaxInitDataFixture({
        authDate: nowSeconds - 10,
        maxUserId: 42_001,
        queryId: "valid-query-id",
      }),
      nowSeconds,
    );

    expect(result).toEqual({
      authDate: nowSeconds - 10,
      expiresAt: nowSeconds - 10 + 3_600,
      queryId: "valid-query-id",
      user: {
        firstName: "Иван",
        languageCode: "ru",
        lastName: "Тестовый",
        maxUserId: "42001",
        username: "max_fixture_user",
      },
    });
  });

  it("rejects a fixture signed with another bot token", () => {
    const initData = createMaxInitDataFixture({
      authDate: nowSeconds,
      botToken: "attacker-token",
      queryId: "invalid-signature",
    });

    expect(() => verifier.verify(initData, nowSeconds)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects expired initData", () => {
    const initData = createMaxInitDataFixture({
      authDate: nowSeconds - 3_601,
      queryId: "expired-query",
    });

    try {
      verifier.verify(initData, nowSeconds);
      throw new Error("Expected verifier to reject expired initData");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: "MAX_INIT_DATA_EXPIRED",
      });
    }
  });

  it("rejects auth_date outside the allowed future clock skew", () => {
    const initData = createMaxInitDataFixture({
      authDate: nowSeconds + 31,
      queryId: "future-query",
    });

    expect(() => verifier.verify(initData, nowSeconds)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects duplicate parameters before signature validation", () => {
    const initData = createMaxInitDataFixture({
      authDate: nowSeconds,
      queryId: "duplicate-query",
    });

    expect(() =>
      verifier.verify(`${initData}&query_id=second-value`, nowSeconds),
    ).toThrow(UnauthorizedException);
  });

  it("decodes plus signs as spaces in form-encoded values", () => {
    const initData = createMaxInitDataFixture({
      authDate: nowSeconds,
      firstName: "Иван Петров",
      queryId: "plus-encoded-query",
    }).replace(/%20/g, "+");

    expect(verifier.verify(initData, nowSeconds).user.firstName).toBe(
      "Иван Петров",
    );
  });
});
