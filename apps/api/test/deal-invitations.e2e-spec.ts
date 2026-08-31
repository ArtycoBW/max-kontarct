import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { API_PREFIX } from "../src/bootstrap/configure-application";
import {
  DealInvitationsController,
  JoinDealInvitationsController,
  PublicDealInvitationsController,
} from "../src/deals/deal-invitations.controller";
import { DealInvitationsService } from "../src/deals/deal-invitations.service";

const userId = "10000000-0000-4000-8000-000000000001";
const dealId = "20000000-0000-4000-8000-000000000001";
const invitationId = "30000000-0000-4000-8000-000000000001";
const versionId = "40000000-0000-4000-8000-000000000001";
const publicCode = "AbCdEfGhIjKl";
const token = "0123456789abcdefghijklmnopqrstuv";

@Injectable()
class TestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().auth = { user: { id: userId, role: "USER" } };
    return true;
  }
}

describe("deal invitations API (e2e)", () => {
  let app: INestApplication;
  const service = {
    approve: jest.fn(async () => ({
      approvalId: "50000000-0000-4000-8000-000000000001",
      approvedAt: "2026-08-31T12:10:00.000Z",
      dealStatus: "COUNTERPARTY_JOINED",
      dealUpdatedAt: "2026-08-31T12:10:00.000Z",
      totalApproved: 1,
      versionId,
      versionNumber: 1,
    })),
    create: jest.fn(async () => invitationResponse()),
    getCurrent: jest.fn(async () => invitationResponse()),
    join: jest.fn(async () => workspaceResponse()),
    markSent: jest.fn(async () => invitationResponse()),
    publicPreview: jest.fn(async () => publicPreviewResponse()),
    revoke: jest.fn(async () => ({ ...invitationResponse(), state: "REVOKED" })),
    workspace: jest.fn(async () => workspaceResponse()),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        DealInvitationsController,
        JoinDealInvitationsController,
        PublicDealInvitationsController,
      ],
      providers: [{ provide: DealInvitationsService, useValue: service }],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(TestSessionGuard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it("serves a limited preview without authentication", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/public/invitations/${publicCode}`)
      .expect(200);
    expect(response.body).toMatchObject({ publicCode, state: "ACTIVE" });
    expect(service.publicPreview).toHaveBeenCalledWith(publicCode);
  });

  it("validates the secret before joining", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deal-invitations/join`)
      .send({ publicCode, token: "too-short" })
      .expect(400);
    expect(service.join).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deal-invitations/join`)
      .send({ publicCode, token })
      .expect(200);
    expect(service.join).toHaveBeenCalledWith(userId, { publicCode, token });
  });

  it("issues, marks and revokes an invitation through authenticated routes", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/invitations`)
      .send({
        expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
        expectedVersionId: versionId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/invitations/${invitationId}/sent`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/invitations/${invitationId}/revoke`)
      .expect(200);
    expect(service.create).toHaveBeenCalledWith(
      userId,
      dealId,
      expect.objectContaining({ expectedVersionId: versionId }),
    );
    expect(service.markSent).toHaveBeenCalledWith(userId, dealId, invitationId);
    expect(service.revoke).toHaveBeenCalledWith(userId, dealId, invitationId);
  });

  it("approves only the version named in the route", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/deals/${dealId}/versions/${versionId}/approve`)
      .send({ expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z" })
      .expect(200);
    expect(service.approve).toHaveBeenCalledWith(
      userId,
      dealId,
      versionId,
      expect.objectContaining({ expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z" }),
    );
  });
});

function invitationResponse() {
  return {
    acceptedAt: null,
    createdAt: "2026-08-31T12:00:00.000Z",
    expiresAt: "2026-09-03T12:00:00.000Z",
    id: invitationId,
    maxDeeplink: `https://max.ru/max_contract_bot?startapp=invite_${publicCode}_${token}`,
    publicCode,
    shareText: "Вас приглашают согласовать условия сделки.",
    shareUrl: `https://www.max-kontrakt.ru/invite/${publicCode}#${token}`,
    state: "ACTIVE",
  };
}

function publicPreviewResponse() {
  return {
    botUsername: "max_contract_bot",
    expiresAt: "2026-09-03T12:00:00.000Z",
    initiatorMaskedName: "А••• Б•••",
    publicCode,
    state: "ACTIVE",
    templateSummary: "Жильё или имущество во временное пользование",
    templateTitle: "Аренда имущества",
    terms: [{ label: "Размер платежа", value: "20 000 ₽" }],
    versionNumber: 1,
    whatItGives: ["Фиксирует согласованные условия"],
  };
}

function workspaceResponse() {
  return {
    approvals: { currentUserApproved: false, required: 2, totalApproved: 0 },
    contractDraft: null,
    counterparty: null,
    createdAt: "2026-08-31T11:00:00.000Z",
    currentUserRole: "COUNTERPARTY",
    draft: {
      answers: {}, clarificationSessionId: null, creationPath: "AI_ASSISTED",
      currentStep: "INITIATOR", description: "Описание", initiator: null,
    },
    id: dealId,
    initiator: { displayName: "Артур Балашев", profileCompleted: true, role: "INITIATOR" },
    invitation: null,
    sourceGenerationId: null,
    status: "COUNTERPARTY_JOINED",
    template: { slug: "property-rental", title: "Аренда имущества", versionId, versionNumber: 1 },
    title: "Аренда квартиры",
    updatedAt: "2026-08-31T12:00:00.000Z",
    versionId,
    versionNumber: 1,
  };
}
