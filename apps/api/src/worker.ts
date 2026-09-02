import "reflect-metadata";
import { createServer } from "node:http";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerAppModule } from "./worker-app.module";
import { ContractGenerationWorker } from "./templates/contract-generation.worker";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerAppModule);
  const logger = new Logger("ContractGenerationWorker");
  const port = process.env.WORKER_HEALTH_PORT ? Number(process.env.WORKER_HEALTH_PORT) : null;
  if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error("Invalid WORKER_HEALTH_PORT");
  const health = port === null ? null : createServer((request, response) => {
    response.statusCode = request.url !== "/health" ? 404 : app.get(ContractGenerationWorker).isHealthy() ? 200 : 503;
    response.end(response.statusCode === 200 ? "ok" : "unavailable");
  }).listen(port, "127.0.0.1");

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Stopping worker after ${signal}`);
    health?.close();
    await app.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  logger.log("Contract generation worker started");
}

void bootstrap();
