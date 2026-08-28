import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../database/prisma.service";
import { MaxContactVerifier } from "./max-contact.verifier";
import { OnboardingService } from "./onboarding.service";

describe("OnboardingService safeguards", () => {
  const configValues: Record<string, unknown> = {
    CONSENT_PERSONAL_DATA_VERSION: "pd-v1",
    CONSENT_STATUS_NOTIFICATIONS_VERSION: "notifications-v1",
    CONSENT_TERMS_VERSION: "terms-v1",
    DEV_MAX_PHONE: "+79991234567",
    NODE_ENV: "production",
  };
  const config = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;
  const service = new OnboardingService(
    config,
    {} as PrismaService,
    {} as MaxContactVerifier,
  );

  it("does not expose the development phone adapter in production", async () => {
    await expect(
      service.verifyDevelopmentPhone("user-id"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not record onboarding without both required consents", async () => {
    await expect(
      service.recordConsents("user-id", {
        personalData: true,
        statusNotifications: false,
        termsOfUse: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
