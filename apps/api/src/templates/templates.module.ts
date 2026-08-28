import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { TemplatesController } from "./templates.controller";
import { TemplatesRepository } from "./templates.repository";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [TemplatesController],
  imports: [AuthModule],
  providers: [TemplatesRepository, TemplatesService],
})
export class TemplatesModule {}
