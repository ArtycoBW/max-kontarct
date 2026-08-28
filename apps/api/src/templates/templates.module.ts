import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { TemplatesController } from "./templates.controller";
import { TemplatesRepository } from "./templates.repository";
import { TemplateSchemaValidator } from "./template-schema.validator";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [TemplatesController],
  imports: [AuthModule],
  providers: [TemplatesRepository, TemplateSchemaValidator, TemplatesService],
})
export class TemplatesModule {}
