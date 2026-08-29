import type {
  ContractGenerationResponse,
  ContractGenerationStatus,
  ContractStructuredDraft,
} from "@max-contract/contracts";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AiGenerationStatus, type Prisma } from "@prisma/client";

import { ContractGenerationQueue } from "./contract-generation.queue";
import type { ContractGenerationRecord } from "./contract-generations.repository";
import { ContractGenerationsRepository } from "./contract-generations.repository";

@Injectable()
export class ContractGenerationsService {
  constructor(
    private readonly generations: ContractGenerationsRepository,
    private readonly queue: ContractGenerationQueue,
  ) {}

  async start(
    templateSlug: string,
    generationId: string,
    userId: string,
  ): Promise<ContractGenerationResponse> {
    const generation = await this.findOwned(templateSlug, generationId, userId);

    if (generation.status === AiGenerationStatus.NEED_MORE_INFO) {
      throw new ConflictException({
        code: "CONTRACT_GENERATION_CLARIFICATION_REQUIRED",
        message: "Сначала ответьте на уточняющие вопросы",
      });
    }
    if (
      generation.status === AiGenerationStatus.QUEUED ||
      generation.status === AiGenerationStatus.GENERATING ||
      generation.status === AiGenerationStatus.COMPLETED
    ) {
      return toResponse(generation);
    }

    const queued = await this.generations.markQueued(generation.id);
    try {
      await this.queue.enqueue(generation.id);
      return toResponse(queued);
    } catch (error) {
      await this.generations.markFailed(generation.id, "QUEUE_UNAVAILABLE");
      throw error;
    }
  }

  async get(
    templateSlug: string,
    generationId: string,
    userId: string,
  ): Promise<ContractGenerationResponse> {
    const generation = await this.findOwned(templateSlug, generationId, userId);
    if (
      generation.status === AiGenerationStatus.NEED_MORE_INFO ||
      generation.status === AiGenerationStatus.READY_TO_GENERATE
    ) {
      throw new ConflictException({
        code: "CONTRACT_GENERATION_NOT_STARTED",
        message: "Подготовка договора ещё не запущена",
      });
    }
    return toResponse(generation);
  }

  private async findOwned(
    templateSlug: string,
    generationId: string,
    userId: string,
  ): Promise<ContractGenerationRecord> {
    const generation = await this.generations.findOwned(
      generationId,
      templateSlug,
      userId,
    );
    if (!generation) {
      throw new NotFoundException({
        code: "CONTRACT_GENERATION_NOT_FOUND",
        message: "Сессия подготовки договора не найдена",
      });
    }
    return generation;
  }
}

function toResponse(record: ContractGenerationRecord): ContractGenerationResponse {
  const status = toContractStatus(record.status);
  return {
    createdAt: record.createdAt.toISOString(),
    draft: record.structuredDraft
      ? parseStoredDraft(record.structuredDraft)
      : null,
    errorMessage:
      status === "FAILED"
        ? "Не удалось подготовить договор. Проверьте соединение и повторите попытку"
        : null,
    id: record.id,
    progress: progressFor(status),
    status,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toContractStatus(status: AiGenerationStatus): ContractGenerationStatus {
  if (
    status === AiGenerationStatus.QUEUED ||
    status === AiGenerationStatus.GENERATING ||
    status === AiGenerationStatus.COMPLETED ||
    status === AiGenerationStatus.FAILED
  ) {
    return status;
  }
  throw new ConflictException({
    code: "CONTRACT_GENERATION_NOT_STARTED",
    message: "Подготовка договора ещё не запущена",
  });
}

function progressFor(status: ContractGenerationStatus): number {
  if (status === "QUEUED") return 15;
  if (status === "GENERATING") return 65;
  if (status === "COMPLETED") return 100;
  return 0;
}

function parseStoredDraft(value: Prisma.JsonValue): ContractStructuredDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConflictException({
      code: "CONTRACT_GENERATION_DATA_INVALID",
      message: "Не удалось открыть подготовленный договор",
    });
  }
  return value as unknown as ContractStructuredDraft;
}
