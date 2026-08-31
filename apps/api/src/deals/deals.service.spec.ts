import { ConflictException, NotFoundException } from "@nestjs/common";
import { DealApprovalStatus, DealStatus } from "@prisma/client";

import { DealStateMachineService } from "./deal-state-machine.service";
import type { DealDraftRecord } from "./deals.repository";
import { DealsRepository } from "./deals.repository";
import { DealsService } from "./deals.service";

const userId = "10000000-0000-4000-8000-000000000001";
const dealId = "20000000-0000-4000-8000-000000000001";
const versionId = "30000000-0000-4000-8000-000000000001";
const secondVersionId = "30000000-0000-4000-8000-000000000002";
const templateVersionId = "40000000-0000-4000-8000-000000000001";
const generationId = "50000000-0000-4000-8000-000000000001";

describe("DealsService", () => {
  const createDraft = jest.fn<
    Promise<DealDraftRecord>,
    [Parameters<DealsRepository["createDraft"]>[0]]
  >();
  const updateDraft = jest.fn<
    Promise<DealDraftRecord | null>,
    [Parameters<DealsRepository["updateDraft"]>[0]]
  >();
  const startAgreement = jest.fn<
    Promise<DealDraftRecord | null>,
    [Parameters<DealsRepository["startAgreement"]>[0]]
  >();
  const createVersion = jest.fn<
    Promise<DealDraftRecord | null>,
    [Parameters<DealsRepository["createVersion"]>[0]]
  >();
  const repository = {
    createVersion,
    createDraft,
    findCompletedGeneration: jest.fn(),
    findInitiator: jest.fn(),
    findOwnedDraft: jest.fn(),
    findPublishedTemplateVersion: jest.fn(),
    findVersionHistory: jest.fn(),
    listOwned: jest.fn(),
    startAgreement,
    updateDraft,
  };
  const service = new DealsService(
    repository as unknown as DealsRepository,
    new DealStateMachineService(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findPublishedTemplateVersion.mockResolvedValue({
      id: templateVersionId,
      template: { slug: "property-rental", title: "Аренда имущества" },
      versionNumber: 1,
    });
    repository.findInitiator.mockResolvedValue({
      maxAccount: { firstName: "Артур", lastName: "Балашев" },
      phones: [{ e164: "+79990000000" }],
      profile: {
        email: "artur@example.test",
        firstName: "Артур",
        lastName: "Балашев",
        middleName: "Вадимович",
      },
    });
    repository.createDraft.mockResolvedValue(draftRecord());
    repository.findCompletedGeneration.mockResolvedValue(null);
    repository.findOwnedDraft.mockResolvedValue(draftRecord());
    repository.updateDraft.mockResolvedValue(draftRecord({
      title: "Аренда квартиры",
    }));
    repository.startAgreement.mockResolvedValue(readyDraftRecord({
      status: DealStatus.COLLECTING_DATA,
    }));
    repository.createVersion.mockResolvedValue(revisedDraftRecord());
    repository.findVersionHistory.mockResolvedValue([]);
  });

  it("creates the deal, initiator snapshot and first draft version", async () => {
    const result = await service.createDraft(userId, {
      creationPath: "AI_ASSISTED",
      description: "  Аренда квартиры на месяц  ",
      templateVersionId,
      title: "  Аренда квартиры  ",
    });

    expect(repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        initiatorUserId: userId,
        templateVersionId,
        title: "Аренда квартиры",
      }),
    );
    expect(createDraft.mock.calls[0]?.[0].terms).toMatchObject({
      answers: {},
      currentStep: "DESCRIPTION",
      description: "Аренда квартиры на месяц",
      initiator: {
        firstName: "Артур",
        phone: "+79990000000",
      },
    });
    expect(result).toMatchObject({ id: dealId, status: "DRAFT" });
  });

  it("does not create a draft for a missing published template", async () => {
    repository.findPublishedTemplateVersion.mockResolvedValue(null);

    await expect(
      service.createDraft(userId, {
        creationPath: "TEMPLATE",
        description: "Описание сделки",
        templateVersionId,
        title: "Сделка",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("merges autosaved fields without creating a new version", async () => {
    await service.updateDraft(userId, dealId, {
      answers: { amount: 20_000 },
      currentStep: "PARAMETERS",
      description: "Аренда квартиры на десять дней",
      expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      title: "Аренда квартиры",
    });

    expect(repository.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId,
        expectedUpdatedAt: new Date("2026-08-31T10:00:00.000Z"),
        title: "Аренда квартиры",
        versionId,
      }),
    );
    expect(updateDraft.mock.calls[0]?.[0].terms).toMatchObject({
      answers: { amount: 20_000 },
      currentStep: "PARAMETERS",
    });
  });

  it("attaches only a completed generation owned by the initiator", async () => {
    repository.findCompletedGeneration.mockResolvedValue({
      id: generationId,
      inputAnswers: {},
      structuredDraft: {
        preamble: "Преамбула",
        sections: [],
        title: "Проект договора",
        warnings: [],
      },
    });

    await service.updateDraft(userId, dealId, {
      expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      sourceGenerationId: "50000000-0000-4000-8000-000000000001",
    });

    const update = updateDraft.mock.calls[0]?.[0];
    expect(update?.contractDraft).toMatchObject({ title: "Проект договора" });
    expect(update?.sourceGenerationId).toBe(
      "50000000-0000-4000-8000-000000000001",
    );
  });

  it("freezes the first ready version when agreement starts", async () => {
    repository.findOwnedDraft.mockResolvedValue(readyDraftRecord());
    repository.findCompletedGeneration.mockResolvedValue({
      id: "50000000-0000-4000-8000-000000000000",
      inputAnswers: { paymentAmount: 20_000 },
      structuredDraft: {
        preamble: "Преамбула",
        sections: [],
        title: "Проект договора",
        warnings: [],
      },
    });

    const result = await service.startAgreement(userId, dealId, {
      expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      expectedVersionId: versionId,
    });

    expect(repository.startAgreement).toHaveBeenCalledWith({
      dealId,
      expectedUpdatedAt: new Date("2026-08-31T10:00:00.000Z"),
      expectedVersionId: versionId,
      nextStatus: DealStatus.COLLECTING_DATA,
      userId,
      versionNumber: 1,
    });
    expect(result.status).toBe("COLLECTING_DATA");
    expect(result.versionNumber).toBe(1);
  });

  it("does not start agreement before the document is ready", async () => {
    await expect(
      service.startAgreement(userId, dealId, {
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        expectedVersionId: versionId,
      }),
    ).rejects.toMatchObject({
      response: { code: "DEAL_DRAFT_NOT_READY" },
    });
    expect(repository.startAgreement).not.toHaveBeenCalled();
  });

  it("does not create revision while the deal is still an editable draft", async () => {
    await expect(
      service.createVersion(userId, dealId, {
        answers: { paymentAmount: 30_000 },
        changeSummary: "Изменена сумма",
        description: "Аренда квартиры на один месяц",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        expectedVersionId: versionId,
        sourceGenerationId: generationId,
      }),
    ).rejects.toMatchObject({
      response: { code: "DEAL_AGREEMENT_NOT_STARTED" },
    });
    expect(repository.findCompletedGeneration).not.toHaveBeenCalled();
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it("rejects a stale version marker before preparing a revision", async () => {
    repository.findOwnedDraft.mockResolvedValue(readyDraftRecord({
      status: DealStatus.TERMS_REVIEW,
    }));

    await expect(
      service.createVersion(userId, dealId, {
        answers: { paymentAmount: 30_000 },
        changeSummary: "Изменена сумма",
        description: "Аренда квартиры на один месяц",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        expectedVersionId: secondVersionId,
        sourceGenerationId: generationId,
      }),
    ).rejects.toMatchObject({
      response: { code: "DEAL_VERSION_CONFLICT" },
    });
    expect(repository.findCompletedGeneration).not.toHaveBeenCalled();
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it("creates a new immutable version from a matching completed generation", async () => {
    repository.findOwnedDraft.mockResolvedValue(readyDraftRecord({
      status: DealStatus.TERMS_REVIEW,
    }));
    repository.findCompletedGeneration.mockResolvedValue({
      id: generationId,
      inputAnswers: { paymentAmount: 30_000 },
      structuredDraft: {
        preamble: "Новая преамбула",
        sections: [],
        title: "Новый проект договора",
        warnings: [],
      },
    });

    const result = await service.createVersion(userId, dealId, {
      answers: { paymentAmount: 30_000 },
      changeSummary: "Изменён размер арендной платы",
      clarificationSessionId: null,
      description: "Аренда квартиры на один месяц",
      expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      expectedVersionId: versionId,
      sourceGenerationId: generationId,
    });

    expect(repository.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSummary: "Изменён размер арендной платы",
        currentStatus: DealStatus.TERMS_REVIEW,
        currentVersionId: versionId,
        nextStatus: DealStatus.TERMS_REVIEW,
        sourceGenerationId: generationId,
        versionNumber: 2,
      }),
    );
    expect(result.versionNumber).toBe(2);
  });

  it("rejects a generated document prepared for different answers", async () => {
    repository.findOwnedDraft.mockResolvedValue(readyDraftRecord({
      status: DealStatus.TERMS_REVIEW,
    }));
    repository.findCompletedGeneration.mockResolvedValue({
      id: generationId,
      inputAnswers: { paymentAmount: 20_000 },
      structuredDraft: { sections: [] },
    });

    await expect(
      service.createVersion(userId, dealId, {
        answers: { paymentAmount: 30_000 },
        changeSummary: "Изменена сумма",
        description: "Аренда квартиры на один месяц",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        expectedVersionId: versionId,
        sourceGenerationId: generationId,
      }),
    ).rejects.toMatchObject({
      response: { code: "DEAL_GENERATION_INPUT_MISMATCH" },
    });
    expect(repository.createVersion).not.toHaveBeenCalled();
  });

  it("returns to terms review when ready-to-sign terms change", async () => {
    repository.findOwnedDraft.mockResolvedValue(readyDraftRecord({
      status: DealStatus.READY_TO_SIGN,
    }));
    repository.findCompletedGeneration.mockResolvedValue({
      id: generationId,
      inputAnswers: { paymentAmount: 30_000 },
      structuredDraft: { sections: [{ clauses: ["Новое условие"] }] },
    });

    await service.createVersion(userId, dealId, {
      answers: { paymentAmount: 30_000 },
      changeSummary: "Изменена сумма",
      description: "Аренда квартиры на один месяц",
      expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      expectedVersionId: versionId,
      sourceGenerationId: generationId,
    });

    expect(createVersion.mock.calls[0]?.[0].nextStatus).toBe(
      DealStatus.TERMS_REVIEW,
    );
  });

  it("returns version history with approval states bound to each version", async () => {
    repository.findVersionHistory.mockResolvedValue([
      {
        approvals: [],
        changeSummary: "Изменена сумма",
        createdAt: new Date("2026-08-31T11:00:00.000Z"),
        id: secondVersionId,
        versionNumber: 2,
      },
      {
        approvals: [
          { status: DealApprovalStatus.SUPERSEDED },
          { status: DealApprovalStatus.REVOKED },
        ],
        changeSummary: null,
        createdAt: new Date("2026-08-31T10:00:00.000Z"),
        id: versionId,
        versionNumber: 1,
      },
    ]);

    const result = await service.listVersions(userId, dealId);

    expect(result).toEqual({
      items: [
        expect.objectContaining({ id: secondVersionId, isCurrent: true }),
        expect.objectContaining({
          approvals: { approved: 0, revoked: 1, superseded: 1 },
          id: versionId,
          isCurrent: false,
        }),
      ],
      total: 2,
    });
  });

  it("reports an optimistic locking conflict instead of overwriting data", async () => {
    repository.updateDraft.mockResolvedValue(null);

    try {
      await service.updateDraft(userId, dealId, {
        description: "Новая версия описания",
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
      });
      throw new Error("Expected optimistic locking conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: "DEAL_DRAFT_VERSION_CONFLICT",
      });
    }
  });

  it("rejects an unavailable generated document", async () => {
    repository.findCompletedGeneration.mockResolvedValue(null);

    await expect(
      service.updateDraft(userId, dealId, {
        expectedUpdatedAt: "2026-08-31T10:00:00.000Z",
        sourceGenerationId: "50000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.updateDraft).not.toHaveBeenCalled();
  });
});

function draftRecord(
  overrides: Partial<DealDraftRecord> = {},
): DealDraftRecord {
  return {
    createdAt: new Date("2026-08-31T09:00:00.000Z"),
    id: dealId,
    initiatorUserId: userId,
    status: DealStatus.DRAFT,
    templateVersion: {
      id: templateVersionId,
      template: { slug: "property-rental", title: "Аренда имущества" },
      versionNumber: 1,
    },
    title: "Аренда имущества",
    updatedAt: new Date("2026-08-31T10:00:00.000Z"),
    versions: [
      {
        contractDraft: null,
        id: versionId,
        sourceGenerationId: null,
        terms: {
          answers: {},
          clarificationSessionId: null,
          creationPath: "AI_ASSISTED",
          currentStep: "DESCRIPTION",
          description: "",
          initiator: {
            email: "artur@example.test",
            firstName: "Артур",
            lastName: "Балашев",
            middleName: "Вадимович",
            phone: "+79990000000",
          },
        },
        versionNumber: 1,
      },
    ],
    ...overrides,
  };
}

function readyDraftRecord(
  overrides: Partial<DealDraftRecord> = {},
): DealDraftRecord {
  return draftRecord({
    versions: [
      {
        contractDraft: {
          preamble: "Преамбула",
          sections: [],
          title: "Проект договора",
          warnings: [],
        },
        id: versionId,
        sourceGenerationId: "50000000-0000-4000-8000-000000000000",
        terms: {
          answers: { paymentAmount: 20_000 },
          clarificationSessionId: null,
          creationPath: "AI_ASSISTED",
          currentStep: "INITIATOR",
          description: "Аренда квартиры на один месяц",
          initiator: {
            email: "artur@example.test",
            firstName: "Артур",
            lastName: "Балашев",
            middleName: "Вадимович",
            phone: "+79990000000",
          },
        },
        versionNumber: 1,
      },
    ],
    ...overrides,
  });
}

function revisedDraftRecord(): DealDraftRecord {
  return readyDraftRecord({
    status: DealStatus.TERMS_REVIEW,
    versions: [
      {
        contractDraft: {
          preamble: "Новая преамбула",
          sections: [],
          title: "Новый проект договора",
          warnings: [],
        },
        id: secondVersionId,
        sourceGenerationId: generationId,
        terms: {
          answers: { paymentAmount: 30_000 },
          clarificationSessionId: null,
          creationPath: "AI_ASSISTED",
          currentStep: "INITIATOR",
          description: "Аренда квартиры на один месяц",
          initiator: {
            email: "artur@example.test",
            firstName: "Артур",
            lastName: "Балашев",
            middleName: "Вадимович",
            phone: "+79990000000",
          },
        },
        versionNumber: 2,
      },
    ],
  });
}
