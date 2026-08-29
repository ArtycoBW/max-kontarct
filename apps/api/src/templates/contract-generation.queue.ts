import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import Redis from "ioredis";

import {
  CONTRACT_GENERATION_JOB,
  CONTRACT_GENERATION_QUEUE,
  type ContractGenerationJobData,
} from "./contract-generation.types";

@Injectable()
export class ContractGenerationQueue implements OnModuleDestroy {
  private connection: Redis | null = null;
  private queue: Queue<ContractGenerationJobData> | null = null;

  constructor(private readonly config: ConfigService) {}

  async enqueue(generationId: string): Promise<void> {
    try {
      const queue = this.getQueue();
      const existing = await queue.getJob(generationId);
      if (existing) {
        const state = await existing.getState();
        if (state === "failed" || state === "completed") {
          await existing.remove();
        } else {
          return;
        }
      }

      await queue.add(
        CONTRACT_GENERATION_JOB,
        { generationId },
        {
          attempts: 3,
          backoff: { delay: 2_000, type: "exponential" },
          jobId: generationId,
          removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
        },
      );
    } catch {
      throw new ServiceUnavailableException({
        code: "CONTRACT_GENERATION_QUEUE_UNAVAILABLE",
        message: "Не удалось запустить подготовку договора. Повторите попытку",
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    if (this.connection && this.connection.status !== "end") {
      await this.connection.quit().catch(() => this.connection?.disconnect());
    }
  }

  private getQueue(): Queue<ContractGenerationJobData> {
    if (this.queue) return this.queue;

    this.connection = new Redis(this.config.getOrThrow<string>("REDIS_URL"), {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<ContractGenerationJobData>(
      CONTRACT_GENERATION_QUEUE,
      {
        connection: this.connection,
        prefix: this.config.getOrThrow<string>(
          "CONTRACT_GENERATION_QUEUE_PREFIX",
        ),
      },
    );
    return this.queue;
  }
}
