import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { TemplateSchemaValidator } from "../templates/template-schema.validator";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  controllers: [AdminController],
  imports: [AuthModule],
  providers: [AdminService, TemplateSchemaValidator],
})
export class AdminModule {}
