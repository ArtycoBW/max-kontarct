import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AiClarificationsRepository } from "./ai-clarifications.repository";
import { AiClarificationsService } from "./ai-clarifications.service";
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
    TemplatesRepository,
    TemplateSchemaValidator,
    TemplatesService,
  ],
})
export class TemplatesModule {}
