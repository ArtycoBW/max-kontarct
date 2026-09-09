import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";

import { AdminController } from "../src/admin/admin.controller";
import { AdminService } from "../src/admin/admin.service";
import { RolesGuard } from "../src/auth/roles.guard";
import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { API_PREFIX } from "../src/bootstrap/configure-application";
import { PrismaService } from "../src/database/prisma.service";
import { ProfileController } from "../src/profile/profile.controller";
import { ProfileService } from "../src/profile/profile.service";
import { TemplateSchemaValidator } from "../src/templates/template-schema.validator";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-28T12:00:00.000Z");

@Injectable()
class TestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestValue = context.switchToHttp().getRequest();
    const header = requestValue.headers["x-test-role"];
    const role = Object.values(UserRole).includes(header)
      ? header
      : UserRole.USER;
    requestValue.auth = {
      sessionHash: "test",
      sessionId: "test",
      user: {
        id: USER_ID,
        maxAccount: {
          firstName: "Анна",
          languageCode: "ru",
          lastName: "Смирнова",
          maxUserId: "900001",
          username: "anna_max",
        },
        role,
      },
    };
    requestValue.id = "request-test";
    return true;
  }
}

describe("profile and admin RBAC (e2e)", () => {
  let app: INestApplication;
  let storedProfile: Record<string, any> | null;
  const auditCreates: Array<Record<string, any>> = [];

  const prisma: any = {
    $transaction: jest.fn(
      async (callback: (transaction: any) => Promise<unknown>) =>
        callback(prisma),
    ),
    auditEvent: {
      count: jest.fn(async () => 1),
      create: jest.fn(async ({ data }: Record<string, any>) => {
        auditCreates.push(data);
        return { id: "audit-created", ...data };
      }),
      findMany: jest.fn(async () => [
        {
          actorUserId: USER_ID,
          createdAt: now,
          entityId: USER_ID,
          entityType: "UserProfile",
          eventType: "USER_PROFILE_UPDATED",
          id: "audit-1",
          metadata: { email: "must-not-leak@example.ru" },
          requestId: "request-test",
        },
      ]),
    },
    user: {
      count: jest.fn(async () => 1),
      findMany: jest.fn(async () => [
        {
          createdAt: now,
          email: "must-not-leak@example.ru",
          id: USER_ID,
          lastSeenAt: now,
          maxAccount: {
            firstName: "Анна",
            lastName: "Смирнова",
            maxUserId: "must-not-leak",
          },
          phones: [{ e164: "+79991234567" }],
          profile: storedProfile,
          role: UserRole.ADMIN,
        },
      ]),
      findUnique: jest.fn(async () => ({
        id: USER_ID,
        maxAccount: {
          firstName: "Анна",
          lastName: "Смирнова",
          username: "anna_max",
        },
        phones: [
          {
            e164: "+79991234567",
            source: "MAX",
            verifiedAt: now,
          },
        ],
        profile: storedProfile,
      })),
    },
    userProfile: {
      upsert: jest.fn(async ({ create, update }: Record<string, any>) => {
        storedProfile = {
          ...storedProfile,
          ...(storedProfile ? update : create),
          updatedAt: now,
        };
        return storedProfile;
      }),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController, ProfileController],
      providers: [
        AdminService,
        ProfileService,
        TemplateSchemaValidator,
        RolesGuard,
        Reflector,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(TestSessionGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    storedProfile = null;
    auditCreates.length = 0;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns MAX fallbacks and the verified contact for a new profile", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/profile`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: null,
      firstName: "Анна",
      lastName: "Смирнова",
      maxUsername: "anna_max",
      phone: { e164: "+79991234567", source: "MAX" },
    });
  });

  it("normalizes and stores a physical-person profile without auditing PII", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/profile`)
      .send({
        birthDate: "1995-05-12",
        email: "ANNA@EXAMPLE.RU",
        firstName: "Анна",
        lastName: "Смирнова",
        middleName: "Игоревна",
      })
      .expect(200);

    expect(response.body).toMatchObject({
      birthDate: "1995-05-12",
      email: "anna@example.ru",
      firstName: "Анна",
      lastName: "Смирнова",
      middleName: "Игоревна",
    });
    expect(auditCreates[0]).toMatchObject({
      eventType: "USER_PROFILE_UPDATED",
      metadata: { changedFields: expect.any(Array) },
    });
    expect(JSON.stringify(auditCreates[0])).not.toContain("anna@example.ru");
  });

  it("rejects a future birth date", async () => {
    await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/profile`)
      .send({
        birthDate: "2999-01-01",
        email: null,
        firstName: "Анна",
        lastName: "Смирнова",
        middleName: null,
      })
      .expect(400);
  });

  it("stores only confirmed passport fields, preserves them for older clients, and does not audit values", async () => {
    const passport = { series: "0000", number: "000000", issuedAt: "2010-03-02", issuer: "Тестовый отдел", divisionCode: "000-000", birthPlace: "Город Пример", gender: "М" };
    const profile = { firstName: "Иван", lastName: "Примеров", birthDate: "1990-02-01" };
    const saved = await request(app.getHttpServer()).patch(`/${API_PREFIX}/profile`).send({ ...profile, passport }).expect(200);
    expect(saved.body.passport).toEqual(passport);
    expect(prisma.userProfile.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: USER_ID } }));
    expect(JSON.stringify(auditCreates.map(event => event.metadata))).not.toMatch(/000000|Тестовый отдел|Город Пример/);
    const olderClient = await request(app.getHttpServer()).patch(`/${API_PREFIX}/profile`).send(profile).expect(200);
    expect(olderClient.body.passport).toEqual(passport);
    const users = await request(app.getHttpServer()).get(`/${API_PREFIX}/admin/users`).set("x-test-role", UserRole.ADMIN).expect(200);
    expect(JSON.stringify(users.body)).not.toMatch(/passport|Тестовый отдел|"number"/);
  });

  it.each([
    { series: "123" }, { number: "abcdef" }, { divisionCode: "111111" },
    { issuedAt: "2039-01-01" }, { issuedAt: "1990-02-31" }, { issuedAt: "1980-01-01" },
    { gender: "other" }, { image: "raw-photo-must-not-be-stored" },
  ])("rejects invalid passport payload %j", async passport => {
    await request(app.getHttpServer()).patch(`/${API_PREFIX}/profile`)
      .send({ firstName: "Иван", lastName: "Примеров", birthDate: "1990-02-01", passport }).expect(400);
    expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
  });

  it("blocks the USER role from admin endpoints", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/users`)
      .set("x-test-role", UserRole.USER)
      .expect(403);

    expect(response.body.message).toBe("Недостаточно прав для этого действия");
  });

  it.each([UserRole.ADMIN, UserRole.SUPPORT])(
    "allows %s and returns a safe user projection",
    async (role) => {
      storedProfile = {
        firstName: "Анна",
        lastName: "Смирнова",
        middleName: null,
      };
      const response = await request(app.getHttpServer())
        .get(`/${API_PREFIX}/admin/users`)
        .set("x-test-role", role)
        .expect(200);

      expect(response.body.items[0]).toEqual({
        createdAt: now.toISOString(),
        displayName: "Смирнова Анна",
        id: USER_ID,
        lastSeenAt: now.toISOString(),
        profileCompleted: true,
        role: UserRole.ADMIN,
      });
      expect(JSON.stringify(response.body)).not.toContain("must-not-leak");
      expect(JSON.stringify(response.body)).not.toContain("+79991234567");
    },
  );

  it("returns audit rows without metadata", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/audit`)
      .set("x-test-role", UserRole.ADMIN)
      .expect(200);

    expect(response.body.items[0]).not.toHaveProperty("metadata");
    expect(JSON.stringify(response.body)).not.toContain("must-not-leak");
  });
});
