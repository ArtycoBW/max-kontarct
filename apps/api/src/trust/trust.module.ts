import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { TrustController } from "./trust.controller";
import { TrustService } from "./trust.service";

@Module({
  controllers: [TrustController],
  exports: [TrustService],
  imports: [AuthModule],
  providers: [TrustService],
})
export class TrustModule {}
