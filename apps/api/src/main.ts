import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { configureApplication } from "./bootstrap/configure-application";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  configureApplication(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>("API_PORT");

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
