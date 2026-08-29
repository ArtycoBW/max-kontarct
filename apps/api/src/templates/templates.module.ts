import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AiClarificationsRepository } from "./ai-clarifications.repository";
import { AiClarificationsService } from "./ai-clarifications.service";
import { ContractGenerationQueue } from "./contract-generation.queue";
import { ContractGenerationsRepository } from "./contract-generations.repository";
import { ContractGenerationsService } from "./contract-generations.service";
import { TemplatesController } from "./templates.controller";
import { TemplatesRepository } from "./templates.repository";
import { TemplateSchemaValidator } from "./template-schema.validator";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [TemplatesController],
  imports: [AuthModule],
  providers: [
    AiClarificationsRepository,
    AiClarificationsService,
    ContractGenerationQueue,
    ContractGenerationsRepository,
    ContractGenerationsService,
    TemplatesRepository,
    TemplateSchemaValidator,
    TemplatesService,
  ],
})
export class TemplatesModule {}
