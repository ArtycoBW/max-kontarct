import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../redis/redis.service";
import { AuthService } from "./auth.service";
import { MaxInitDataVerifier } from "./max-init-data.verifier";
import { MaxReplayProtectionService } from "./max-replay-protection.service";

describe("AuthService production safeguards", () => {
  const configValues: Record<string, unknown> = {
    AUTH_COOKIE_NAME: "max_contract_session",
    AUTH_REDIS_PREFIX: "max-contract:test-auth",
    AUTH_SESSION_TTL_SECONDS: 3_600,
    NODE_ENV: "production",
  };
  const config = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const service = new AuthService(
    config,
    {} as PrismaService,
    {} as RedisService,
    {} as MaxInitDataVerifier,
    {} as MaxReplayProtectionService,
  );

  it("does not expose the development adapter in production", async () => {
    await expect(service.authenticateDevelopment()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("marks the production session cookie as HttpOnly and Secure", () => {
    expect(service.getCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });
});
