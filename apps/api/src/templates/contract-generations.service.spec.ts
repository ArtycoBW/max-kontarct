import { ServiceUnavailableException } from "@nestjs/common";
import { AiGenerationStatus } from "@prisma/client";

import { ContractGenerationQueue } from "./contract-generation.queue";
import type { ContractGenerationRecord } from "./contract-generations.repository";
import { ContractGenerationsRepository } from "./contract-generations.repository";
import { ContractGenerationsService } from "./contract-generations.service";

const generationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";

describe("ContractGenerationsService", () => {
  const findOwned = jest.fn<
    Promise<ContractGenerationRecord | null>,
    [string, string, string]
  >();
  const markFailed = jest.fn<Promise<ContractGenerationRecord>, [string, string]>();
  const markQueued = jest.fn<Promise<ContractGenerationRecord>, [string]>();
  const enqueue = jest.fn<Promise<void>, [string]>();
  const service = new ContractGenerationsService(
    { findOwned, markFailed, markQueued } as unknown as ContractGenerationsRepository,
    { enqueue } as unknown as ContractGenerationQueue,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queues a ready clarification session", async () => {
    findOwned.mockResolvedValue(record(AiGenerationStatus.READY_TO_GENERATE));
    markQueued.mockResolvedValue(record(AiGenerationStatus.QUEUED));
    enqueue.mockResolvedValue();

    await expect(
      service.start("property-rental", generationId, userId),
    ).resolves.toMatchObject({
      id: generationId,
      progress: 15,
      status: "QUEUED",
    });

    expect(markQueued).toHaveBeenCalledWith(generationId);
    expect(enqueue).toHaveBeenCalledWith(generationId);
  });

  it("is idempotent while a job is already running", async () => {
    findOwned.mockResolvedValue(record(AiGenerationStatus.GENERATING));

    await expect(
      service.start("property-rental", generationId, userId),
    ).resolves.toMatchObject({ progress: 65, status: "GENERATING" });

    expect(markQueued).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("stores a safe failure state when Redis cannot accept the job", async () => {
    const error = new ServiceUnavailableException("queue unavailable");
    findOwned.mockResolvedValue(record(AiGenerationStatus.READY_TO_GENERATE));
    markQueued.mockResolvedValue(record(AiGenerationStatus.QUEUED));
    markFailed.mockResolvedValue(record(AiGenerationStatus.FAILED));
    enqueue.mockRejectedValue(error);

    await expect(
      service.start("property-rental", generationId, userId),
    ).rejects.toBe(error);
    expect(markFailed).toHaveBeenCalledWith(generationId, "QUEUE_UNAVAILABLE");
  });

  it("never exposes the stored provider failure code", async () => {
    findOwned.mockResolvedValue(
      record(AiGenerationStatus.FAILED, { failureCode: "RAW_PROVIDER_500" }),
    );

    await expect(
      service.get("property-rental", generationId, userId),
    ).resolves.toMatchObject({
      errorMessage:
        "Не удалось подготовить договор. Проверьте соединение и повторите попытку",
      status: "FAILED",
    });
  });
});

function record(
  status: AiGenerationStatus,
  overrides: Partial<ContractGenerationRecord> = {},
): ContractGenerationRecord {
  return {
    attemptCount: 0,
    clarificationAnswers: {},
    completedAt: null,
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    failedAt: null,
    failureCode: null,
    id: generationId,
    inputAnswers: { price: 1000 },
    providerMetadata: {},
    queuedAt: null,
    startedAt: null,
    status,
    structuredDraft: null,
    templateVersion: {
      documentRequirements: [],
      template: { slug: "property-rental", title: "Аренда имущества" },
      versionNumber: 1,
    },
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
    userId,
    ...overrides,
  };
}
