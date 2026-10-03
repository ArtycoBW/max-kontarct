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
    $executeRaw: jest.fn(),
    auditEvent: { create: jest.fn() },
    deal: { updateMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn() },
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
    dealInvitation: { findUnique: invitationFindUnique, update: jest.fn() },
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
    transaction.deal.findFirst.mockResolvedValue(null);
    transaction.$executeRaw.mockResolvedValue(1);
    dealFindFirst.mockResolvedValue(workspaceRecord());
    transaction.deal.updateMany.mockResolvedValue({ count: 1 });
    transaction.deal.findUniqueOrThrow.mockResolvedValue({ ...workspaceRecord(), parties: [initiatorParty(), counterpartyParty()], templateVersion: { documentRequirements: [{ id: "required-identity", required: true }] }, files: [] });
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

  it("blocks invitation creation and sent confirmation without complete passport details", async () => {
    const party = initiatorParty();
    party.user.profile.passportDetails.number = "";
    dealFindFirst.mockResolvedValue(workspaceRecord({ parties: [party] }));
    await expect(service.create(initiatorId, dealId, { expectedUpdatedAt: "2026-08-31T12:00:00.000Z", expectedVersionId: versionId }))
      .rejects.toMatchObject({ response: { code: "DEAL_INVITATION_REQUISITES_REQUIRED" } });
    await expect(service.markSent(initiatorId, dealId, invitationId))
      .rejects.toMatchObject({ response: { code: "DEAL_INVITATION_REQUISITES_REQUIRED" } });
    expect(maxBot.createMiniAppDeeplink).not.toHaveBeenCalled();
    expect(prisma.dealInvitation.update).not.toHaveBeenCalled();
    expect(transaction.dealInvitation.create).not.toHaveBeenCalled();
  });

  it("persists the participant's explicit confirmation that an early invitation was sent", async () => {
    const invitation = { acceptedAt: null, sentAt: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 60000), revokedAt: null, id: invitationId, publicCode: "test" };
    dealFindFirst.mockResolvedValue(workspaceRecord({ status: DealStatus.DRAFT, invitations: [invitation] }));
    prisma.dealInvitation.update.mockResolvedValue({ ...invitation, sentAt: new Date("2026-09-27T13:00:00Z") });
    const response = await service.markSent(initiatorId, dealId, invitationId);
    expect(response.sentAt).toBe("2026-09-27T13:00:00.000Z");
    expect(prisma.dealInvitation.update).toHaveBeenCalledWith({ where: { id: invitationId }, data: { sentAt: expect.any(Date) }, select: expect.objectContaining({ sentAt: true }) });
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

  it("creates an invitation during draft preparation without advancing or changing its revision", async () => {
    const record = workspaceRecord({ status: DealStatus.DRAFT });
    dealFindFirst.mockResolvedValue(record);
    await service.create(initiatorId, dealId, { expectedUpdatedAt: record.updatedAt.toISOString(), expectedVersionId: versionId });
    expect(transaction.deal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: DealStatus.DRAFT, updatedAt: record.updatedAt } }));
  });

  it("does not disclose a protected offer for a wrong token", async () => {
    invitationFindUnique.mockResolvedValue(joinInvitation("correct-token-value-1234567890ab"));
    await expect(service.protectedPreview({ publicCode: "AbCdEfGhIjKl", token: "wrong-token-value-1234567890123" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("joins an early draft without overwriting its last editor timestamp", async () => {
    const token = "correct-token-value-1234567890ab";
    const invitation = joinInvitation(token);
    invitationFindUnique.mockResolvedValue({ ...invitation, deal: { ...invitation.deal, status: DealStatus.DRAFT } });
    prisma.user.findUnique.mockResolvedValue({ consents: [
      { documentVersion: "personal-v1", granted: true, type: ConsentType.PERSONAL_DATA },
      { documentVersion: "terms-v1", granted: true, type: ConsentType.TERMS_OF_USE },
    ], phones: [{ id: "phone" }] });
    transaction.dealInvitation.updateMany.mockResolvedValue({ count: 1 });
    dealFindFirst.mockResolvedValue(workspaceRecord({ status: DealStatus.DRAFT, parties: [initiatorParty(), counterpartyParty()] }));
    await service.join(counterpartyId, { publicCode: "AbCdEfGhIjKl", token });
    expect(transaction.$executeRaw).toHaveBeenCalled();
    expect(transaction.deal.updateMany).not.toHaveBeenCalled();
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

  it("reopens an accepted invitation only for its original participant, including after expiry", async () => {
    const token = "correct-token-value-1234567890ab";
    invitationFindUnique.mockResolvedValue({ ...joinInvitation(token), acceptedAt: new Date(), acceptedByUserId: counterpartyId, expiresAt: new Date(0) });
    const workspace = jest.spyOn(service, "workspace").mockResolvedValue({ id: dealId } as never);
    try {
      await expect(service.join(counterpartyId, { publicCode: "AbCdEfGhIjKl", token })).resolves.toMatchObject({ id: dealId });
      expect(workspace).toHaveBeenCalledWith(counterpartyId, dealId);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      await expect(service.join("another-user", { publicCode: "AbCdEfGhIjKl", token })).rejects.toMatchObject({ status: 409 });
      expect(workspace).toHaveBeenCalledTimes(1);
    } finally { workspace.mockRestore(); }
  });

  it("moves an existing deal to terms review when both profiles already contain passport data", async () => {
    const updatedAt = new Date("2026-08-31T12:00:00.000Z");
    const profile = {
      addressValue: "г. Москва", birthDate: new Date("1990-01-01T00:00:00.000Z"), email: null,
      firstName: "Анна", lastName: "Примерова", middleName: null,
      passportDetails: { series: "1234", number: "567890", issuedAt: "2020-01-02", issuer: "МВД", divisionCode: "123-456", birthPlace: "Казань", gender: "Ж" },
    };
    transaction.deal.findFirst.mockResolvedValue({ status: DealStatus.DOCUMENTS_PENDING, updatedAt });
    transaction.deal.findUniqueOrThrow.mockResolvedValue({
      ...workspaceRecord(),
      parties: [
        { ...initiatorParty(), user: { ...initiatorParty().user, profile } },
        { ...counterpartyParty(), user: { ...counterpartyParty().user, profile } },
      ],
      templateVersion: { documentRequirements: [{ id: "identity", key: "identity_document", title: "Документ, удостоверяющий личность", required: true }] },
      files: [],
    });
    dealFindFirst.mockResolvedValue(workspaceRecord({
      parties: [initiatorParty(), counterpartyParty()],
      status: DealStatus.TERMS_REVIEW,
    }));

    const result = await service.workspace(initiatorId, dealId);

    expect(result.status).toBe(DealStatus.TERMS_REVIEW);
    expect(transaction.deal.updateMany).toHaveBeenCalledWith({
      data: { status: DealStatus.TERMS_REVIEW, updatedAt: expect.any(Date) },
      where: { id: dealId, status: DealStatus.DOCUMENTS_PENDING, updatedAt },
    });
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

  it.each(["ACCEPTED", "PENDING", "REJECTED"])("rechecks %s documents when the second party joins", async (reviewStatus) => {
    dealFindFirst.mockResolvedValue(workspaceRecord({ parties: [initiatorParty(), counterpartyParty()] }));
    const token = "correct-token-value-1234567890ab";
    invitationFindUnique.mockResolvedValue(joinInvitation(token));
    prisma.user.findUnique.mockResolvedValue({ consents: [
      { documentVersion: "personal-v1", granted: true, type: ConsentType.PERSONAL_DATA },
      { documentVersion: "terms-v1", granted: true, type: ConsentType.TERMS_OF_USE },
    ], maxAccount: { maxUserId: "222" }, phones: [{ id: "phone" }] });
    transaction.dealInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.maxAccount.findUnique.mockResolvedValue({ maxUserId: "111" });
    transaction.deal.findUniqueOrThrow.mockResolvedValue({ ...workspaceRecord(),
      parties: [initiatorParty(), counterpartyParty()],
      templateVersion: { documentRequirements: [{ id: "identity", required: true }] },
      files: [initiatorId, counterpartyId].map(ownerUserId => ({ ownerUserId, requirementId: "identity", reviewStatus })),
    });
    await service.join(counterpartyId, { publicCode: "AbCdEfGhIjKl", token });
    expect(transaction.deal.updateMany).toHaveBeenLastCalledWith({
      where: { id: dealId, status: "DOCUMENTS_PENDING" },
      data: { status: "TERMS_REVIEW" },
    });
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
        frozenSnapshot: expect.objectContaining({ schemaVersion: "deal-signature-v2" }),
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

  it("requires a new version if the named party profile changed after generation", async () => {
    const record = workspaceRecord({ parties: [initiatorParty(), counterpartyParty()], status: DealStatus.TERMS_REVIEW });
    dealFindFirst.mockResolvedValue({ ...record, versions: record.versions.map(version => ({ ...version,
      sourceGeneration: { providerMetadata: { partyNames: { INITIATOR: "Другое ФИО", COUNTERPARTY: "Иванова Мария" } } },
    })) });
    await expect(service.approve(initiatorId, dealId, versionId, { expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z" }))
      .rejects.toMatchObject({ response: { code: "DEAL_PARTY_DETAILS_CHANGED" } });
    expect(transaction.dealApproval.upsert).not.toHaveBeenCalled();
  });

  it("allows agreement without any mandatory file reviews", async () => {
    const record = workspaceRecord({ parties: [initiatorParty(), counterpartyParty()], status: DealStatus.TERMS_REVIEW });
    dealFindFirst.mockResolvedValue({ ...record, templateVersion: { ...record.templateVersion, documentRequirements: [{ id: "required-identity", required: true }] } });
    transaction.dealFile.findMany.mockResolvedValue([{ ownerUserId: initiatorId, requirementId: "required-identity" }]);
    await expect(service.approve(counterpartyId, dealId, versionId, { expectedDealUpdatedAt: "2026-08-31T12:00:00.000Z" }))
      .resolves.toMatchObject({ dealStatus: "TERMS_REVIEW" });
    expect(transaction.dealApproval.upsert).toHaveBeenCalled();
    expect(transaction.dealVersion.updateMany).toHaveBeenCalled();
  });

  it("previews passport fields and rejects agreement after profile details change", async () => {
    const passportDetails = { series: "1234", number: "567890", issuer: "Тестовое подразделение", issuedAt: "2020-01-02", divisionCode: "123-456", birthPlace: "Тестовый город", gender: "М", privateExtra: "must-not-leak" };
    const party = initiatorParty();
    const record = workspaceRecord({ parties: [{ ...party, user: { ...party.user, profile: { ...party.user.profile, passportDetails } } }, counterpartyParty()], status: DealStatus.TERMS_REVIEW });
    dealFindFirst.mockResolvedValue(record);
    const preview = await service.workspace(initiatorId, dealId);
    expect(preview.requisites?.parties.find(p => p.role === "INITIATOR")).toMatchObject({ phone: "+79990000001", passport: { series: "1234", number: "567890" } });
    expect(JSON.stringify(preview.requisites)).not.toContain("privateExtra");
    passportDetails.number = "999999";
    await expect(service.approve(initiatorId, dealId, versionId, { expectedDealUpdatedAt: record.updatedAt.toISOString(), expectedRequisitesHash: preview.requisites!.hash }))
      .rejects.toMatchObject({ response: { code: "DEAL_REQUISITES_CHANGED" } });
    expect(transaction.dealApproval.upsert).not.toHaveBeenCalled();
  });

  it("freezes full requisites at first approval and keeps them after profile edits", async () => {
    const party = initiatorParty();
    const profile = { ...party.user.profile, passportDetails: { series: "1234", number: "567890" } };
    const record = workspaceRecord({ parties: [{ ...party, user: { ...party.user, profile } }, counterpartyParty()], status: DealStatus.TERMS_REVIEW });
    dealFindFirst.mockResolvedValue(record);
    const preview = await service.workspace(initiatorId, dealId);
    await service.approve(initiatorId, dealId, versionId, { expectedDealUpdatedAt: record.updatedAt.toISOString(), expectedRequisitesHash: preview.requisites!.hash });
    const frozen = transaction.dealVersion.updateMany.mock.calls[0]![0].data;
    expect(frozen.frozenSnapshot.parties).toEqual(expect.arrayContaining([expect.objectContaining({ verifiedPhone: "+79990000001", profile: expect.objectContaining({ passport: expect.objectContaining({ number: "567890" }) }) })]));
    profile.passportDetails.number = "999999";
    dealFindFirst.mockResolvedValue({ ...record, versions: [{ ...record.versions[0], ...frozen, approvals: [{ partyId: party.id, status: "APPROVED", approvedAt: new Date() }] }] });
    const after = await service.workspace(counterpartyId, dealId);
    expect(after.requisites?.frozen).toBe(true);
    expect(after.requisites?.hash).toBe(preview.requisites?.hash);
    transaction.dealVersion.updateMany.mockClear();
    await expect(service.approve(counterpartyId, dealId, versionId, { expectedDealUpdatedAt: record.updatedAt.toISOString(), expectedRequisitesHash: after.requisites!.hash })).resolves.toMatchObject({ dealStatus: "READY_TO_SIGN" });
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
        addressValue: "г. Москва", birthDate: new Date("1990-01-01"), email: null,
        passportDetails: { series: "1234", number: "567890", issuedAt: "2020-01-02", issuer: "МВД", divisionCode: "123-456", birthPlace: "Казань", gender: "М" },
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
