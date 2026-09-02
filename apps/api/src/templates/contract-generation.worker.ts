import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import Redis from "ioredis";

import { ContractGenerationProcessor } from "./contract-generation.processor";
import {
  CONTRACT_GENERATION_QUEUE,
  type ContractGenerationJobData,
} from "./contract-generation.types";

@Injectable()
export class ContractGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private connection: Redis | null = null;
  private readonly logger = new Logger(ContractGenerationWorker.name);
  private worker: Worker<ContractGenerationJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly processor: ContractGenerationProcessor,
  ) {}

  onModuleInit(): void {
    this.connection = new Redis(this.config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker<ContractGenerationJobData>(
      CONTRACT_GENERATION_QUEUE,
      (job) => this.processor.process(job),
      {
        concurrency: 2,
        connection: this.connection,
        prefix: this.config.getOrThrow<string>(
          "CONTRACT_GENERATION_QUEUE_PREFIX",
        ),
      },
    );
    this.worker.on("completed", (job) => {
      this.logger.log(`Contract generation completed: ${job.id ?? "unknown"}`);
    });
    this.worker.on("failed", (job, error) => {
      this.logger.warn(
        `Contract generation attempt failed: ${job?.id ?? "unknown"}; ${error.name}`,
      );
    });
    this.worker.on("error", (error) => {
      this.logger.error(`Contract generation worker error: ${error.name}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    if (this.connection && this.connection.status !== "end") {
      await this.connection.quit().catch(() => this.connection?.disconnect());
    }
  }

  isHealthy(): boolean {
    return Boolean(this.worker?.isRunning() && this.connection?.status === "ready");
  }
}
