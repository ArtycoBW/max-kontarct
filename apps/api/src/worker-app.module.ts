import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AiModule } from "./ai/ai.module";
import { validateEnvironment } from "./config/environment";
import { PrismaModule } from "./database/prisma.module";
import { ContractGenerationProcessor } from "./templates/contract-generation.processor";
import { ContractGenerationWorker } from "./templates/contract-generation.worker";
import { ContractGenerationsRepository } from "./templates/contract-generations.repository";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [".env.local", ".env"],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AiModule,
  ],
  providers: [
    ContractGenerationProcessor,
    ContractGenerationWorker,
    ContractGenerationsRepository,
  ],
})
export class WorkerAppModule {}
