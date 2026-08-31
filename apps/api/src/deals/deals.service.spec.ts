import { ConflictException, NotFoundException } from "@nestjs/common";
import { DealStatus } from "@prisma/client";

import type { DealDraftRecord } from "./deals.repository";
import { DealsRepository } from "./deals.repository";
import { DealsService } from "./deals.service";

const userId = "10000000-0000-4000-8000-000000000001";
const dealId = "20000000-0000-4000-8000-000000000001";
const versionId = "30000000-0000-4000-8000-000000000001";
const templateVersionId = "40000000-0000-4000-8000-000000000001";

describe("DealsService", () => {
  const createDraft = jest.fn<
    Promise<DealDraftRecord>,
    [Parameters<DealsRepository["createDraft"]>[0]]
  >();
  const updateDraft = jest.fn<
    Promise<DealDraftRecord | null>,
    [Parameters<DealsRepository["updateDraft"]>[0]]
  >();
  const repository = {
    createDraft,
    findCompletedGeneration: jest.fn(),
    findInitiator: jest.fn(),
    findOwnedDraft: jest.fn(),
    findPublishedTemplateVersion: jest.fn(),
    listOwned: jest.fn(),
    updateDraft,
  };
  const service = new DealsService(
    repository as unknown as DealsRepository,
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
    repository.findOwnedDraft.mockResolvedValue(draftRecord());
    repository.updateDraft.mockResolvedValue(draftRecord({
      title: "Аренда квартиры",
    }));
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
      id: "50000000-0000-4000-8000-000000000001",
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
