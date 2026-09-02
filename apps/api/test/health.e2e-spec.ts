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
import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";
import { RedisService } from "../src/redis/redis.service";
import { STORAGE_SERVICE } from "../src/storage/storage.service";

describe("Health endpoints (e2e)", () => {
  let app: INestApplication;
  const dependencyState = {
    postgres: true,
    redis: true,
    storage: true,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "CORS_ORIGINS") {
                return "http://localhost:3000";
              }

              throw new Error(`Unexpected configuration key: ${key}`);
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            ping: jest.fn(async () => {
              if (!dependencyState.postgres) {
                throw new Error("postgres unavailable");
              }
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            ping: jest.fn(async () => {
              if (!dependencyState.redis) {
                throw new Error("redis unavailable");
              }
            }),
          },
        },
        {
          provide: STORAGE_SERVICE,
          useValue: {
            checkHealth: jest.fn(async () => {
              if (!dependencyState.storage) {
                throw new Error("storage unavailable");
              }
            }),
          },
        },
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
    dependencyState.postgres = true;
    dependencyState.redis = true;
    dependencyState.storage = true;
  });

  it("reports liveness independently from external dependencies", async () => {
    dependencyState.postgres = false;
    dependencyState.redis = false;
    dependencyState.storage = false;

    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health/live`)
      .expect(200);

    expect(response.body).toMatchObject({ status: "ok" });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it("allows only configured browser origins", async () => {
    const allowed = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health/live`)
      .set("origin", "http://localhost:3000")
      .expect(200);

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );

    const disallowed = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health/live`)
      .set("origin", "https://evil.example")
      .expect(200);

    expect(disallowed.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("blocks cross-site mutations before handlers, including simple form requests", async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/auth/max`)
      .set("origin", "https://evil.example")
      .type("form")
      .send({ initData: "untrusted" })
      .expect(403);
    expect(response.body.code).toBe("ORIGIN_FORBIDDEN");
  });

  it("reports readiness, fails when Redis is down, and recovers", async () => {
    const healthy = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health/ready`)
      .expect(200);

    expect(healthy.body.checks).toEqual({
      postgres: { status: "up" },
      redis: { status: "up" },
      storage: { status: "up" },
    });

    dependencyState.redis = false;

    const unavailable = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health/ready`)
      .set("x-request-id", "e2e-request-123")
      .expect(503);

    expect(unavailable.headers["x-request-id"]).toBe("e2e-request-123");
    expect(unavailable.body).toEqual({
      code: "DEPENDENCIES_UNAVAILABLE",
      details: {
        checks: {
          postgres: { status: "up" },
          redis: { status: "down" },
          storage: { status: "up" },
        },
      },
      message: "Сервис временно не готов",
      requestId: "e2e-request-123",
    });

    dependencyState.redis = true;

    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/health/ready`)
      .expect(200);
  });
});
