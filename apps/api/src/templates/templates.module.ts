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
import { DealIntakeController } from "./deal-intake.controller";
import { DealIntakeService } from "./deal-intake.service";

@Module({
  controllers: [TemplatesController, DealIntakeController],
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
    DealIntakeService,
  ],
})
export class TemplatesModule {}
