import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { API_PREFIX } from "../src/bootstrap/configure-application";
import { DealsController } from "../src/deals/deals.controller";
import { DealsService } from "../src/deals/deals.service";

const userId = "10000000-0000-4000-8000-000000000001";
const dealId = "20000000-0000-4000-8000-000000000001";
const templateVersionId = "30000000-0000-4000-8000-000000000001";
const generationId = "50000000-0000-4000-8000-000000000001";

@Injectable()
class TestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().auth = {
      user: { id: userId, role: "USER" },
    };
    return true;
  }
}

describe("deals API (e2e)", () => {
  let app: INestApplication;
  const createDraft = jest.fn(async () => draftResponse());
  const getDraft = jest.fn(async () => draftResponse());
  const list = jest.fn(async () => ({
    items: [
      {
        id: dealId,
        status: "DRAFT",
        templateTitle: "Аренда имущества",
        title: "Аренда квартиры",
        updatedAt: "2026-08-31T10:00:00.000Z",
        versionNumber: 1,
      },
    ],
    total: 1,
  }));
  const updateDraft = jest.fn(async () => draftResponse({
    draft: {
      ...draftResponse().draft,
      currentStep: "PARAMETERS",
      description: "Аренда квартиры на месяц",
    },
  }));
  const startAgreement = jest.fn(async () =>
    draftResponse({ status: "COLLECTING_DATA" }),
  );
  const createVersion = jest.fn(async () =>
    draftResponse({
      versionId: "40000000-0000-4000-8000-000000000002",
      versionNumber: 2,
    }),
  );
  const listVersions = jest.fn(async () => ({
    items: [
      {
        approvals: { approved: 0, revoked: 0, superseded: 0 },
        changeSummary: null,
        createdAt: "2026-08-31T09:00:00.000Z",
        id: "40000000-0000-4000-8000-000000000001",
        isCurrent: true,
        versionNumber: 1,
      },
    ],
    total: 1,
  }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DealsController],
      providers: [
        {
          provide: DealsService,
          useValue: {
            createDraft,
            createVersion,
            getDraft,
            list,
            listVersions,
            startAgreement,
            updateDraft,
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

  afterAll(async () => {
    await app?.close();
  });

  it("creates an authenticated server draft", async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals`)
      .send({
        creationPath: "AI_ASSISTED",
        description: "",
        templateVersionId,
        title: "Аренда квартиры",
      })
      .expect(201);

    expect(response.body).toMatchObject({ id: dealId, status: "DRAFT" });
    expect(createDraft).toHaveBeenLastCalledWith(
      userId,
      expect.objectContaining({ templateVersionId }),
    );
  });

  it("lists only deals available to the authenticated user", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/deals`)
      .expect(200);

    expect(response.body).toMatchObject({ total: 1 });
    expect(list).toHaveBeenLastCalledWith(userId);
  });

  it("restores a draft by a validated UUID", async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/deals/${dealId}`)
      .expect(200);

    expect(getDraft).toHaveBeenLastCalledWith(userId, dealId);
  });

  it("autosaves with an optimistic concurrency marker", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/deals/${dealId}/draft`)
      .send({
        answers: { amount: 25_000 },
        currentStep: "PARAMETERS",
        description: "Аренда квартиры на месяц",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      })
      .expect(200);

    expect(response.body.draft.currentStep).toBe("PARAMETERS");
    expect(updateDraft).toHaveBeenLastCalledWith(
      userId,
      dealId,
      expect.objectContaining({ expectedUpdatedAt: "2026-08-31T10:00:00.000Z" }),
    );
  });

  it("rejects an autosave without its server revision", async () => {
    await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/deals/${dealId}/draft`)
      .send({ description: "Нельзя перезаписывать вслепую" })
      .expect(400);
    expect(updateDraft).not.toHaveBeenCalledWith(
      userId,
      dealId,
      expect.objectContaining({ description: "Нельзя перезаписывать вслепую" }),
    );
  });

  it("rejects unsupported draft fields and steps", async () => {
    await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/deals/${dealId}/draft`)
      .send({
        currentStep: "SIGNED",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        passport: "must-not-be-accepted",
      })
      .expect(400);
  });

  it("freezes the current version before agreement starts", async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/agreement/start`)
      .send({
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        expectedVersionId: "40000000-0000-4000-8000-000000000001",
      })
      .expect(200);

    expect(response.body.status).toBe("COLLECTING_DATA");
    expect(startAgreement).toHaveBeenLastCalledWith(
      userId,
      dealId,
      expect.objectContaining({
        expectedVersionId: "40000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("creates a validated material revision", async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/versions`)
      .send({
        answers: { paymentAmount: 30_000 },
        changeSummary: "Изменена сумма аренды",
        clarificationSessionId: null,
        description: "Аренда квартиры на один месяц",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        expectedVersionId: "40000000-0000-4000-8000-000000000001",
        sourceGenerationId: generationId,
      })
      .expect(201);

    expect(response.body.versionNumber).toBe(2);
    expect(createVersion).toHaveBeenLastCalledWith(
      userId,
      dealId,
      expect.objectContaining({ sourceGenerationId: generationId }),
    );
  });

  it("rejects an unversioned revision payload", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/versions`)
      .send({
        answers: {},
        changeSummary: "x",
        description: "коротко",
      })
      .expect(400);
    expect(createVersion).not.toHaveBeenCalledWith(
      userId,
      dealId,
      expect.objectContaining({ changeSummary: "x" }),
    );
  });

  it("returns the version history for an available deal", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/deals/${dealId}/versions`)
      .expect(200);

    expect(response.body).toMatchObject({
      items: [expect.objectContaining({ isCurrent: true, versionNumber: 1 })],
      total: 1,
    });
    expect(listVersions).toHaveBeenLastCalledWith(userId, dealId);
  });
});

function draftResponse(overrides: Record<string, unknown> = {}) {
  return {
    contractDraft: null,
    createdAt: "2026-08-31T09:00:00.000Z",
    draft: {
      answers: {},
      clarificationSessionId: null,
      creationPath: "AI_ASSISTED",
      currentStep: "DESCRIPTION",
      description: "",
      initiator: {
        email: null,
        firstName: "Артур",
        lastName: "Балашев",
        middleName: null,
        phone: "+79990000000",
      },
    },
    id: dealId,
    sourceGenerationId: null,
    status: "DRAFT",
    template: {
      slug: "property-rental",
      title: "Аренда имущества",
      versionId: templateVersionId,
      versionNumber: 1,
    },
    title: "Аренда квартиры",
    updatedAt: "2026-08-31T10:00:00.000Z",
    versionId: "40000000-0000-4000-8000-000000000001",
    versionNumber: 1,
    ...overrides,
  };
}
