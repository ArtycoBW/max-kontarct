import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerAppModule } from "./worker-app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  const logger = new Logger("ContractGenerationWorker");

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Stopping worker after ${signal}`);
    await app.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  logger.log("Contract generation worker started");
}

void bootstrap();
