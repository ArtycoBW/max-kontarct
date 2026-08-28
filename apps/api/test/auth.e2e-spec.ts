import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import request from "supertest";

import {
  API_PREFIX,
  configureApplication,
} from "../src/bootstrap/configure-application";
import { ApiExceptionFilter } from "../src/common/errors/api-exception.filter";
import { PrismaService } from "../src/database/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { MaxInitDataVerifier } from "../src/auth/max-init-data.verifier";
import { MaxReplayProtectionService } from "../src/auth/max-replay-protection.service";
import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { MaxContactVerifier } from "../src/onboarding/max-contact.verifier";
import { OnboardingController } from "../src/onboarding/onboarding.controller";
import { OnboardingService } from "../src/onboarding/onboarding.service";
import { createMaxContactFixture } from "./fixtures/max-contact.fixture";
import {
  createMaxInitDataFixture,
  TEST_MAX_BOT_TOKEN,
} from "./fixtures/max-init-data.fixture";

interface StoredAccount {
  firstName: string | null;
  id: string;
  languageCode: string | null;
  lastAuthenticatedAt: Date;
  lastName: string | null;
  maxUserId: string;
  user: StoredUser;
  userId: string;
  username: string | null;
}

interface StoredSession {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  sessionHash: string;
  updatedAt: Date;
  userId: string;
}

interface StoredConsent {
  documentVersion: string;
  granted: boolean;
  recordedAt: Date;
  source: "MINI_APP" | "DEV_SEED";
  type: string;
  userId: string;
}

interface StoredPhone {
  e164: string;
  id: string;
  isPrimary: boolean;
  source: "MAX" | "DEV";
  userId: string;
  verifiedAt: Date;
}

interface StoredUser {
  createdAt: Date;
  id: string;
  lastSeenAt: Date | null;
  role: "USER";
  updatedAt: Date;
}

describe("MAX authentication (e2e)", () => {
  let app: INestApplication;
  const accounts = new Map<string, StoredAccount>();
  const consents = new Map<string, StoredConsent>();
  const phones = new Map<string, StoredPhone>();
  const redis = new Map<string, string>();
  const sessions = new Map<string, StoredSession>();
  const configValues: Record<string, unknown> = {
    AUTH_COOKIE_NAME: "max_contract_session",
    AUTH_REDIS_PREFIX: "max-contract:test-auth",
    AUTH_SESSION_TTL_SECONDS: 3_600,
    CONSENT_PERSONAL_DATA_VERSION: "pd-v1",
    CONSENT_STATUS_NOTIFICATIONS_VERSION: "notifications-v1",
    CONSENT_TERMS_VERSION: "terms-v1",
    CORS_ORIGINS: "http://localhost:3000",
    DEV_MAX_FIRST_NAME: "Иван",
    DEV_MAX_LANGUAGE_CODE: "ru",
    DEV_MAX_LAST_NAME: "Тестовый",
    DEV_MAX_PHONE: "+79991234567",
    DEV_MAX_USER_ID: "900001",
    DEV_MAX_USERNAME: "dev_max_user",
    MAX_BOT_TOKEN: TEST_MAX_BOT_TOKEN,
    MAX_CONTACT_FUTURE_SKEW_SECONDS: 30,
    MAX_CONTACT_TTL_SECONDS: 300,
    MAX_INIT_DATA_FUTURE_SKEW_SECONDS: 30,
    MAX_INIT_DATA_TTL_SECONDS: 3_600,
    NODE_ENV: "test",
  };
  let accountSequence = 0;
  let phoneSequence = 0;
  let sessionSequence = 0;

  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in configValues)) {
        throw new Error(`Unexpected configuration key: ${key}`);
      }
      return configValues[key];
    }),
  } as unknown as ConfigService;

  const prisma = {
    $transaction: jest.fn(
      async (callback: (transaction: PrismaService) => Promise<unknown>) =>
        callback(prisma),
    ),
    auditEvent: {
      create: jest.fn(async () => ({ id: "audit-id" })),
    },
    maxAccount: {
      upsert: jest.fn(
        async ({ create, update, where }: Record<string, any>) => {
          const existing = accounts.get(where.maxUserId as string);
          if (existing) {
            existing.firstName = update.firstName as string;
            existing.languageCode = update.languageCode as string | null;
            existing.lastAuthenticatedAt = update.lastAuthenticatedAt as Date;
            existing.lastName = update.lastName as string | null;
            existing.username = update.username as string | null;
            existing.user.lastSeenAt = update.user.update.lastSeenAt as Date;
            return existing;
          }

          accountSequence += 1;
          const now = new Date();
          const user: StoredUser = {
            createdAt: now,
            id: `00000000-0000-4000-8000-${String(accountSequence).padStart(12, "0")}`,
            lastSeenAt: create.user.create.lastSeenAt as Date,
            role: "USER",
            updatedAt: now,
          };
          const account: StoredAccount = {
            firstName: create.firstName as string,
            id: `10000000-0000-4000-8000-${String(accountSequence).padStart(12, "0")}`,
            languageCode: create.languageCode as string | null,
            lastAuthenticatedAt: create.lastAuthenticatedAt as Date,
            lastName: create.lastName as string | null,
            maxUserId: create.maxUserId as string,
            user,
            userId: user.id,
            username: create.username as string | null,
          };
          accounts.set(account.maxUserId, account);
          return account;
        },
      ),
    },
    userConsent: {
      findMany: jest.fn(async ({ where }: Record<string, any>) =>
        [...consents.values()].filter(
          (consent) =>
            consent.userId === where.userId &&
            (where.OR as Array<Record<string, string>>).some(
              (candidate) =>
                candidate.type === consent.type &&
                candidate.documentVersion === consent.documentVersion,
            ),
        ),
      ),
      upsert: jest.fn(
        async ({ create, update, where }: Record<string, any>) => {
          const unique = where.userId_type_documentVersion as Record<
            string,
            string
          >;
          const key = `${unique.userId}:${unique.type}:${unique.documentVersion}`;
          const existing = consents.get(key);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const consent = {
            ...create,
            recordedAt: new Date(),
          } as StoredConsent;
          consents.set(key, consent);
          return consent;
        },
      ),
    },
    userPhone: {
      findFirst: jest.fn(async ({ where }: Record<string, any>) => {
        const matches = [...phones.values()].filter(
          (phone) => phone.userId === where.userId,
        );
        return (
          matches.sort(
            (left, right) =>
              Number(right.isPrimary) - Number(left.isPrimary) ||
              right.verifiedAt.getTime() - left.verifiedAt.getTime(),
          )[0] ?? null
        );
      }),
      findUnique: jest.fn(async ({ where }: Record<string, any>) =>
        phones.get(where.e164 as string) ?? null,
      ),
      updateMany: jest.fn(async ({ data, where }: Record<string, any>) => {
        let count = 0;
        for (const phone of phones.values()) {
          if (phone.userId === where.userId && phone.isPrimary === where.isPrimary) {
            Object.assign(phone, data);
            count += 1;
          }
        }
        return { count };
      }),
      upsert: jest.fn(
        async ({ create, update, where }: Record<string, any>) => {
          const existing = phones.get(where.e164 as string);
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          phoneSequence += 1;
          const phone = {
            ...create,
            id: `30000000-0000-4000-8000-${String(phoneSequence).padStart(12, "0")}`,
          } as StoredPhone;
          phones.set(phone.e164, phone);
          return phone;
        },
      ),
    },
    userSession: {
      create: jest.fn(async ({ data }: Record<string, any>) => {
        sessionSequence += 1;
        const now = new Date();
        const session: StoredSession = {
          createdAt: now,
          expiresAt: data.expiresAt as Date,
          id: `20000000-0000-4000-8000-${String(sessionSequence).padStart(12, "0")}`,
          lastSeenAt: data.lastSeenAt as Date,
          revokedAt: null,
          sessionHash: data.sessionHash as string,
          updatedAt: now,
          userId: data.userId as string,
        };
        sessions.set(session.sessionHash, session);
        return session;
      }),
      findUnique: jest.fn(async ({ where }: Record<string, any>) => {
        const session = sessions.get(where.sessionHash as string);
        if (!session) return null;
        const account = [...accounts.values()].find(
          (candidate) => candidate.userId === session.userId,
        );
        return account
          ? { ...session, user: { ...account.user, maxAccount: account } }
          : null;
      }),
      update: jest.fn(async ({ data, where }: Record<string, any>) => {
        const session = [...sessions.values()].find(
          (candidate) => candidate.id === where.id,
        );
        if (session) Object.assign(session, data);
        return session;
      }),
      updateMany: jest.fn(async ({ data, where }: Record<string, any>) => {
        const session = [...sessions.values()].find(
          (candidate) => candidate.id === where.id,
        );
        if (session && session.revokedAt === null) Object.assign(session, data);
        return { count: session ? 1 : 0 };
      }),
    },
  } as unknown as PrismaService;

  const redisService = {
    delete: jest.fn(async (key: string) => {
      redis.delete(key);
    }),
    get: jest.fn(async (key: string) => redis.get(key) ?? null),
    setIfAbsent: jest.fn(
      async (key: string, value: string) => {
        if (redis.has(key)) return false;
        redis.set(key, value);
        return true;
      },
    ),
    setWithExpiry: jest.fn(async (key: string, value: string) => {
      redis.set(key, value);
    }),
  } as unknown as RedisService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, OnboardingController],
      providers: [
        AuthService,
        MaxInitDataVerifier,
        MaxContactVerifier,
        MaxReplayProtectionService,
        OnboardingService,
        SessionAuthGuard,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();
    const logger = {
      error: jest.fn(),
      setContext: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger;

    app = moduleRef.createNestApplication();
    configureApplication(app);
    app.useGlobalFilters(new ApiExceptionFilter(logger));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    accounts.clear();
    consents.clear();
    phones.clear();
    redis.clear();
    sessions.clear();
    accountSequence = 0;
    phoneSequence = 0;
    sessionSequence = 0;
    jest.clearAllMocks();
  });

  it("authenticates valid initData and resolves the HttpOnly session", async () => {
    const agent = request.agent(app.getHttpServer());
    const initData = createMaxInitDataFixture({
      maxUserId: 70_001,
      queryId: "e2e-valid-query",
    });

    const authenticated = await agent
      .post(`/${API_PREFIX}/auth/max`)
      .send({ initData })
      .expect(200);

    expect(authenticated.body.user).toMatchObject({
      maxAccount: { maxUserId: "70001", username: "max_fixture_user" },
      role: "USER",
    });
    expect(authenticated.body).not.toHaveProperty("sessionToken");
    expect(authenticated.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(authenticated.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");

    const me = await agent.get(`/${API_PREFIX}/auth/me`).expect(200);
    expect(me.body.user.id).toBe(authenticated.body.user.id);
  });

  it("rejects initData with an invalid signature", async () => {
    const initData = createMaxInitDataFixture({
      botToken: "invalid-token",
      queryId: "e2e-invalid-signature",
    });

    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/max`)
      .send({ initData })
      .expect(401);

    expect(response.body.code).toBe("MAX_INIT_DATA_INVALID");
  });

  it("rejects expired initData", async () => {
    const initData = createMaxInitDataFixture({
      authDate: Math.floor(Date.now() / 1_000) - 3_601,
      queryId: "e2e-expired",
    });

    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/max`)
      .send({ initData })
      .expect(401);

    expect(response.body.code).toBe("MAX_INIT_DATA_EXPIRED");
  });

  it("rejects replay of a previously consumed query_id", async () => {
    const initData = createMaxInitDataFixture({ queryId: "e2e-replay" });

    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/max`)
      .send({ initData })
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/max`)
      .send({ initData })
      .expect(401);

    expect(replay.body.code).toBe("MAX_INIT_DATA_REPLAYED");
  });

  it("supports the non-production adapter and revokes its session on logout", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent.post(`/${API_PREFIX}/auth/dev`).expect(200);
    await agent.get(`/${API_PREFIX}/auth/me`).expect(200);
    await agent.post(`/${API_PREFIX}/auth/logout`).expect(204);

    const afterLogout = await agent.get(`/${API_PREFIX}/auth/me`).expect(401);
    expect(afterLogout.body.code).toBe("AUTH_SESSION_REQUIRED");
  });

  it("invalidates a malformed server-side session", async () => {
    const agent = request.agent(app.getHttpServer());

    await agent.post(`/${API_PREFIX}/auth/dev`).expect(200);
    const sessionKey = [...redis.keys()].find((key) => key.includes(":session:"));
    expect(sessionKey).toBeDefined();
    redis.set(sessionKey!, "not-json");

    const response = await agent.get(`/${API_PREFIX}/auth/me`).expect(401);
    expect(response.body.code).toBe("AUTH_SESSION_INVALID");
    expect(redis.has(sessionKey!)).toBe(false);
  });

  it("records versioned consents and completes onboarding with the dev adapter", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`/${API_PREFIX}/auth/dev`).expect(200);

    const initial = await agent.get(`/${API_PREFIX}/onboarding`).expect(200);
    expect(initial.body).toMatchObject({
      completed: false,
      phoneVerified: false,
      requiredConsentsAccepted: false,
    });

    const accepted = await agent
      .post(`/${API_PREFIX}/onboarding/consents`)
      .send({
        personalData: true,
        statusNotifications: false,
        termsOfUse: true,
      })
      .expect(201);
    expect(accepted.body).toMatchObject({
      completed: false,
      requiredConsentsAccepted: true,
    });
    expect(accepted.body.consents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          granted: true,
          type: "PERSONAL_DATA",
          version: "pd-v1",
        }),
        expect.objectContaining({
          granted: false,
          type: "STATUS_NOTIFICATIONS",
          version: "notifications-v1",
        }),
      ]),
    );

    const completed = await agent
      .post(`/${API_PREFIX}/onboarding/phone/dev`)
      .expect(201);
    expect(completed.body).toMatchObject({
      completed: true,
      phone: { e164: "+79991234567", source: "DEV" },
      phoneVerified: true,
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "DEV_PHONE_VERIFIED" }),
      }),
    );
  });

  it("verifies a signed MAX contact for the authenticated MAX user", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`/${API_PREFIX}/auth/dev`).expect(200);
    const contact = createMaxContactFixture({
      botToken: TEST_MAX_BOT_TOKEN,
      maxUserId: "900001",
    });

    const response = await agent
      .post(`/${API_PREFIX}/onboarding/phone/max`)
      .send(contact)
      .expect(201);

    expect(response.body.phone).toMatchObject({
      e164: "+79991234567",
      source: "MAX",
    });
  });

  it("never treats a manually entered phone as MAX-verified", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`/${API_PREFIX}/auth/dev`).expect(200);

    await agent
      .post(`/${API_PREFIX}/onboarding/phone/max`)
      .send({ phone: "+79991234567" })
      .expect(400);

    expect(phones.size).toBe(0);
  });
});
