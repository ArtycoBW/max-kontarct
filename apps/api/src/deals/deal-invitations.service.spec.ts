/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { createHash } from "node:crypto";

import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConsentType, DealPartyRole, DealStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { MaxBotService } from "../max-bot/max-bot.service";
import { DealInvitationsService } from "./deal-invitations.service";
import { DealStateMachineService } from "./deal-state-machine.service";

const initiatorId = "10000000-0000-4000-8000-000000000001";
const counterpartyId = "10000000-0000-4000-8000-000000000002";
const dealId = "20000000-0000-4000-8000-000000000001";
const versionId = "30000000-0000-4000-8000-000000000001";
const invitationId = "40000000-0000-4000-8000-000000000001";

describe("DealInvitationsService", () => {
  const dealFindFirst = jest.fn();
  const invitationFindUnique = jest.fn();
  const transaction = {
    auditEvent: { create: jest.fn() },
    deal: { updateMany: jest.fn() },
    dealFile: { findMany: jest.fn() },
    dealApproval: { create: jest.fn(), upsert: jest.fn() },
    dealVersion: { updateMany: jest.fn() },
    dealInvitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    dealParty: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: unknown) => {
      if (typeof callback !== "function") throw new Error("unexpected batch");
      return callback(transaction);
    }),
    deal: { findFirst: dealFindFirst },
    dealInvitation: { findUnique: invitationFindUnique },
    maxAccount: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const maxBot = {
    createMiniAppDeeplink: jest.fn(async (payload: string) =>
      `https://max.ru/max_contract_bot?startapp=${payload}`,
    ),
    getBotUsername: jest.fn(async () => "max_contract_bot"),
    sendUserNotification: jest.fn(async () => true),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string | number> = {
        CONSENT_PERSONAL_DATA_VERSION: "personal-v1",
        CONSENT_STATUS_NOTIFICATIONS_VERSION: "notifications-v1",
        CONSENT_TERMS_VERSION: "terms-v1",
        DEAL_INVITATION_TTL_SECONDS: 259_200,
        PUBLIC_WEB_URL: "https://www.max-kontrakt.ru",
      };
      return values[key];
    }),
  };
  const service = new DealInvitationsService(
    config as never,
    maxBot as unknown as MaxBotService,
    prisma as unknown as PrismaService,
    new DealStateMachineService(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    dealFindFirst.mockResolvedValue(workspaceRecord());
    transaction.deal.updateMany.mockResolvedValue({ count: 1 });
    transaction.dealFile.findMany.mockResolvedValue([]);
    transaction.dealVersion.updateMany.mockResolvedValue({ count: 1 });
    transaction.dealApproval.upsert.mockResolvedValue({
      approvedAt: new Date("2026-08-31T12:00:00.000Z"),
      id: "80000000-0000-4000-8000-000000000001",
    });
    transaction.dealInvitation.findFirst.mockResolvedValue(null);
    transaction.dealInvitation.updateMany.mockResolvedValue({ count: 0 });
    transaction.dealInvitation.create.mockImplementation(async ({ data }) => ({
      acceptedAt: null,
      createdAt: new Date("2026-08-31T12:00:00.000Z"),
      expiresAt: data.expiresAt,
      id: invitationId,
      publicCode: data.publicCode,
      revokedAt: null,
    }));
  });

  it("issues a secret only once and stores only its SHA-256 hash", async () => {
    const result = await service.create(initiatorId, dealId, {
      expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
      expectedVersionId: versionId,
    });

    expect(result.shareUrl).toMatch(
      /^https:\/\/www\.max-kontrakt\.ru\/invite\/[A-Za-z0-9_-]{12}#[A-Za-z0-9_-]{32}$/,
    );
    const rawToken = result.shareUrl?.split("#")[1] ?? "";
    const stored = transaction.dealInvitation.create.mock.calls[0]?.[0].data;
    expect(stored).not.toHaveProperty("token");
    expect(stored.tokenHash).toBe(
      createHash("sha256").update(rawToken).digest("hex"),
    );
    expect(result.maxDeeplink).toContain("?startapp=invite_");
    expect(transaction.deal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DealStatus.INVITATION_READY }),
      }),
    );
  });

  it("returns only whitelisted non-PII terms in the public preview", async () => {
    invitationFindUnique.mockResolvedValue({
      acceptedAt: null,
      acceptedByUserId: null,
      acceptedBy: null,
      createdBy: {
        maxAccount: { firstName: "Артур", lastName: "Балашев" },
        profile: { firstName: "Артур", lastName: "Балашев" },
      },
      deal: {
        templateVersion: {
          questionnaireSchema: {
            properties: {
              completionDate: { title: "Срок оказания услуги" },
              paymentAmount: { title: "Стоимость услуги, ₽" },
              serviceDescription: { title: "Описание услуги" },
              serviceLocation: { title: "Адрес" },
            },
          },
          template: {
            slug: "paid-services",
            summary: "Условия оказания услуг",
            title: "Оказание услуг",
          },
        },
        versions: [
          {
            terms: draftTerms({
              completionDate: "2026-09-10",
              paymentAmount: 20_000,
              paymentProcedure: "После оказания услуги",
              serviceDescription: "Секретное описание",
              serviceLocation: "Ростов-на-Дону, Нансена, 109",
            }),
            versionNumber: 1,
          },
        ],
      },
      expiresAt: new Date(Date.now() + 60_000),
      publicCode: "AbCdEfGhIjKl",
      revokedAt: null,
    });

    const result = await service.publicPreview("AbCdEfGhIjKl");

    expect(result.initiatorMaskedName).toBe("А••• Б•••");
    expect(result.terms.map(({ label }) => label)).toEqual([
      "Предмет сделки",
      "Срок оказания услуги",
      "Стоимость услуги, ₽",
      "Условие",
    ]);
    expect(JSON.stringify(result)).not.toContain("Нансена");
    expect(JSON.stringify(result)).not.toContain("Секретное описание");
  });

  it("does not allow a guessed token to reach the join transaction", async () => {
    invitationFindUnique.mockResolvedValue(joinInvitation("correct-token-value-1234567890ab"));

    await expect(
      service.join(counterpartyId, {
        publicCode: "AbCdEfGhIjKl",
        token: "wrong-token-value-1234567890123",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["expired", "revoked"])("rejects a %s invitation before joining", async (kind) => {
    const token = "correct-token-value-1234567890ab";
    const invitation = { ...joinInvitation(token), expiresAt: kind === "expired" ? new Date(0) : new Date(Date.now() + 60_000), revokedAt: kind === "revoked" ? new Date() : null };
    invitationFindUnique.mockResolvedValue(invitation);
    await expect(service.join(counterpartyId, { publicCode: "AbCdEfGhIjKl", token })).rejects.toMatchObject({ status: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("denies private deal data before the user has joined", async () => {
    dealFindFirst.mockResolvedValue(null);

    await expect(service.workspace(counterpartyId, dealId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dealFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: dealId, parties: { some: { userId: counterpartyId } } },
      }),
    );
  });

  it("joins atomically with required consents even when notifications were declined", async () => {
    const token = "correct-token-value-1234567890ab";
    invitationFindUnique.mockResolvedValue(joinInvitation(token));
    prisma.user.findUnique.mockResolvedValue({
      consents: [
        { documentVersion: "personal-v1", granted: true, type: ConsentType.PERSONAL_DATA },
        { documentVersion: "terms-v1", granted: true, type: ConsentType.TERMS_OF_USE },
      ],
      maxAccount: { maxUserId: "222" },
      phones: [{ id: "phone" }],
    });
    transaction.dealInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.maxAccount.findUnique.mockResolvedValue({ maxUserId: "111" });
    dealFindFirst.mockResolvedValueOnce(
      workspaceRecord({
        parties: [initiatorParty(), counterpartyParty()],
        status: DealStatus.DOCUMENTS_PENDING,
      }),
    );

    const result = await service.join(counterpartyId, {
      publicCode: "AbCdEfGhIjKl",
      token,
    });

    expect(transaction.dealParty.create).toHaveBeenCalledWith({
      data: { dealId, role: DealPartyRole.COUNTERPARTY, userId: counterpartyId },
    });
    expect(transaction.deal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DealStatus.DOCUMENTS_PENDING }),
      }),
    );
    expect(result.currentUserRole).toBe(DealPartyRole.COUNTERPARTY);
  });

  it("requires mandatory onboarding consents before joining", async () => {
    const token = "correct-token-value-1234567890ab";
    invitationFindUnique.mockResolvedValue(joinInvitation(token));
    prisma.user.findUnique.mockResolvedValue({
      consents: [],
      maxAccount: { maxUserId: "222" },
      phones: [{ id: "phone" }],
    });

    await expect(
      service.join(counterpartyId, { publicCode: "AbCdEfGhIjKl", token }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.dealParty.create).not.toHaveBeenCalled();
  });

  it("freezes an exact canonical snapshot before READY_TO_SIGN", async () => {
    transaction.dealFile.findMany.mockResolvedValue([
      { ownerUserId: initiatorId, requirementId: "required-identity" },
      { ownerUserId: counterpartyId, requirementId: "required-identity" },
    ]);
    dealFindFirst.mockResolvedValue(workspaceRecord({
      parties: [initiatorParty(), counterpartyParty()],
      status: DealStatus.TERMS_REVIEW,
      templateVersion: { ...workspaceRecord().templateVersion, documentRequirements: [{ id: "required-identity", required: true }] },
      versions: [{
        ...workspaceRecord().versions[0],
        approvals: [{
          approvedAt: new Date("2026-08-31T11:59:00.000Z"),
          id: "81000000-0000-4000-8000-000000000001",
          partyId: initiatorParty().id,
          status: "APPROVED",
        }],
      }],
    }));

    const result = await service.approve(counterpartyId, dealId, versionId, {
      expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z",
    });

    expect(result.dealStatus).toBe(DealStatus.READY_TO_SIGN);
    expect(transaction.dealVersion.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractNumber: expect.stringMatching(/^МК-\d{8}-[A-F0-9]{8}-V1$/),
        frozenSnapshot: expect.objectContaining({ schemaVersion: "deal-signature-v1" }),
        snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      where: { frozenAt: null, id: versionId },
    });
    expect(transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "DEAL_VERSION_FROZEN" }),
    });
  });

  it("does not accept preliminary agreement while documents are pending", async () => {
    dealFindFirst.mockResolvedValue(workspaceRecord({ parties: [initiatorParty(), counterpartyParty()], status: DealStatus.DOCUMENTS_PENDING }));
    await expect(service.approve(initiatorId, dealId, versionId, { expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z" }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "DEAL_APPROVAL_NOT_ALLOWED" }) });
    expect(transaction.dealApproval.upsert).not.toHaveBeenCalled();
  });

  it("checks accepted documents of both parties even when the status says terms review", async () => {
    const record = workspaceRecord({ parties: [initiatorParty(), counterpartyParty()], status: DealStatus.TERMS_REVIEW });
    dealFindFirst.mockResolvedValue({ ...record, templateVersion: { ...record.templateVersion, documentRequirements: [{ id: "required-identity", required: true }] } });
    transaction.dealFile.findMany.mockResolvedValue([{ ownerUserId: initiatorId, requirementId: "required-identity" }]);
    await expect(service.approve(counterpartyId, dealId, versionId, { expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z" }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: "DEAL_APPROVAL_DOCUMENTS_REQUIRED" }) });
    expect(transaction.dealApproval.upsert).not.toHaveBeenCalled();
    expect(transaction.dealVersion.updateMany).not.toHaveBeenCalled();
  });
});

function workspaceRecord(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-08-31T11:00:00.000Z"),
    id: dealId,
    initiatorUserId: initiatorId,
    invitations: [],
    parties: [initiatorParty()],
    status: DealStatus.COLLECTING_DATA,
    templateVersion: {
      documentRequirements: [],
      id: "50000000-0000-4000-8000-000000000001",
      template: { slug: "property-rental", title: "Аренда имущества" },
      versionNumber: 1,
    },
    title: "Аренда квартиры",
    updatedAt: new Date("2026-08-31T12:00:00.000Z"),
    versions: [
      {
        approvals: [],
        contractDraft: {
          preamble: "Стороны договорились",
          sections: [],
          title: "Договор аренды",
          warnings: [],
        },
        id: versionId,
        sourceGenerationId: "60000000-0000-4000-8000-000000000001",
        terms: draftTerms({ startDate: "2026-09-01" }),
        versionNumber: 1,
      },
    ],
    ...overrides,
  };
}

function initiatorParty() {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    role: DealPartyRole.INITIATOR,
    user: {
      maxAccount: { firstName: "Артур", lastName: "Балашев", maxUserId: "111" },
      phones: [{ e164: "+79990000001", id: "phone-1" }],
      profile: {
        addressValue: "г. Москва", birthDate: null, email: null,
        firstName: "Артур", lastName: "Балашев", middleName: null,
      },
    },
    userId: initiatorId,
  };
}

function counterpartyParty() {
  return {
    id: "70000000-0000-4000-8000-000000000002",
    role: DealPartyRole.COUNTERPARTY,
    user: {
      maxAccount: { firstName: "Мария", lastName: "Иванова", maxUserId: "222" },
      phones: [{ e164: "+79990000002", id: "phone-2" }],
      profile: {
        addressValue: "г. Москва", birthDate: null, email: null,
        firstName: "Мария", lastName: "Иванова", middleName: null,
      },
    },
    userId: counterpartyId,
  };
}

function draftTerms(answers: Record<string, unknown>) {
  return {
    answers,
    clarificationSessionId: null,
    creationPath: "AI_ASSISTED",
    currentStep: "INITIATOR",
    description: "Описание сделки",
    initiator: null,
  };
}

function joinInvitation(token: string) {
  return {
    acceptedAt: null,
    acceptedByUserId: null,
    createdByUserId: initiatorId,
    deal: { id: dealId, initiatorUserId: initiatorId, status: DealStatus.INVITED, templateVersion: { documentRequirements: [{ id: "required-identity" }] } },
    expiresAt: new Date(Date.now() + 60_000),
    id: invitationId,
    revokedAt: null,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}
