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

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TEMPLATE_ID = "10000000-0000-4000-8000-000000000001";
const VERSION_ID = "20000000-0000-4000-8000-000000000001";

@Injectable()
class TestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestValue = context.switchToHttp().getRequest();
    const header = requestValue.headers["x-test-role"];
    const role = Object.values(UserRole).includes(header)
      ? header
      : UserRole.USER;
    requestValue.auth = { user: { id: USER_ID, role } };
    requestValue.id = "request-admin-e2e";
    return true;
  }
}

describe("admin template management RBAC (e2e)", () => {
  let app: INestApplication;
  const createDraftVersion = jest.fn(async () => version());
  const updateDraftVersion = jest.fn(async () => version());
  const listTemplates = jest.fn(async () => ({ items: [], total: 0 }));
  const listAiGenerations = jest.fn(async () => ({ items: [], total: 0 }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        RolesGuard,
        Reflector,
        {
          provide: AdminService,
          useValue: {
            archiveDraftVersion: jest.fn(async () => version("ARCHIVED")),
            createDraftVersion,
            listAiGenerations,
            listAuditEvents: jest.fn(async () => ({ items: [], total: 0 })),
            listTemplates,
            listUsers: jest.fn(async () => ({ items: [], total: 0 })),
            publishDraftVersion: jest.fn(async () => version("PUBLISHED")),
            updateDraftVersion,
          },
        },
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

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it("allows support to safely inspect templates and AI metadata", async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/templates`)
      .set("x-test-role", UserRole.SUPPORT)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/ai-generations`)
      .set("x-test-role", UserRole.SUPPORT)
      .expect(200);

    expect(listTemplates).toHaveBeenCalledTimes(1);
    expect(listAiGenerations).toHaveBeenCalledTimes(1);
  });

  it("blocks support from changing template versions", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/admin/templates/${TEMPLATE_ID}/versions`)
      .set("x-test-role", UserRole.SUPPORT)
      .expect(403);

    expect(createDraftVersion).not.toHaveBeenCalled();
  });

  it("allows an administrator to create a draft with actor and request context", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/admin/templates/${TEMPLATE_ID}/versions`)
      .set("x-test-role", UserRole.ADMIN)
      .expect(201);

    expect(createDraftVersion).toHaveBeenCalledWith(
      TEMPLATE_ID,
      USER_ID,
      "request-admin-e2e",
    );
  });

  it("rejects malformed document requirements", async () => {
    await request(app.getHttpServer())
      .patch(
        `/${API_PREFIX}/admin/templates/${TEMPLATE_ID}/versions/${VERSION_ID}`,
      )
      .set("x-test-role", UserRole.ADMIN)
      .send({
        documentRequirements: [
          {
            description: "Описание",
            key: "BAD KEY",
            required: true,
            sortOrder: -1,
            title: "Документ",
          },
        ],
      })
      .expect(400);

    expect(updateDraftVersion).not.toHaveBeenCalled();
  });

  it("rejects unknown request fields", async () => {
    await request(app.getHttpServer())
      .patch(
        `/${API_PREFIX}/admin/templates/${TEMPLATE_ID}/versions/${VERSION_ID}`,
      )
      .set("x-test-role", UserRole.ADMIN)
      .send({ unknown: "value" })
      .expect(400);
  });
});

function version(status = "DRAFT") {
  return {
    archivedAt: null,
    createdAt: "2026-08-30T12:00:00.000Z",
    documentRequirements: [],
    id: VERSION_ID,
    publishedAt: null,
    questionnaireSchema: {
      additionalProperties: false,
      properties: {},
      type: "object",
    },
    status,
    updatedAt: "2026-08-30T12:00:00.000Z",
    versionNumber: 2,
  };
}
