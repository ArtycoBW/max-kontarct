import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  createMaxContactFixture,
  TEST_MAX_CONTACT_BOT_TOKEN,
} from "../../test/fixtures/max-contact.fixture";
import { MaxContactVerifier, normalizePhone } from "./max-contact.verifier";

describe("MaxContactVerifier", () => {
  const nowSeconds = 2_000_000_000;
  const configValues: Record<string, unknown> = {
    MAX_BOT_TOKEN: TEST_MAX_CONTACT_BOT_TOKEN,
    MAX_CONTACT_FUTURE_SKEW_SECONDS: 30,
    MAX_CONTACT_TTL_SECONDS: 300,
  };
  const config = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const verifier = new MaxContactVerifier(config);

  it("verifies the documented MAX contact HMAC", () => {
    const contact = createMaxContactFixture({
      authDate: nowSeconds - 10,
      maxUserId: "42001",
      phone: "+79991234567",
    });

    expect(verifier.verify(contact, "42001", nowSeconds)).toBe(
      "+79991234567",
    );
  });

  it("verifies a MAX contact timestamp returned in milliseconds", () => {
    const contact = createMaxContactFixture({
      authDate: nowSeconds * 1_000 + 321,
      maxUserId: "42001",
      phone: "+79991234567",
    });

    expect(verifier.verify(contact, "42001", nowSeconds)).toBe(
      "+79991234567",
    );
  });

  it("rejects a hash created for another user", () => {
    const contact = createMaxContactFixture({
      authDate: nowSeconds,
      maxUserId: "another-user",
    });

    expect(() => verifier.verify(contact, "42001", nowSeconds)).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects an expired contact proof", () => {
    const contact = createMaxContactFixture({
      authDate: nowSeconds - 301,
      maxUserId: "42001",
    });

    try {
      verifier.verify(contact, "42001", nowSeconds);
      throw new Error("Expected verifier to reject an expired proof");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: "MAX_CONTACT_EXPIRED",
      });
    }
  });

  it("rejects a contact proof outside the future clock skew", () => {
    const contact = createMaxContactFixture({
      authDate: nowSeconds + 31,
      maxUserId: "42001",
    });

    expect(() => verifier.verify(contact, "42001", nowSeconds)).toThrow(
      UnauthorizedException,
    );
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+79991234567", "+79991234567"],
    ["89991234567", "+79991234567"],
    ["9991234567", "+79991234567"],
    ["+12025550143", "+12025550143"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
