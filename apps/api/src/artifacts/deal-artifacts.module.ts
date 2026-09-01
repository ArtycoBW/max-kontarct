import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealArtifactsController } from "./deal-artifacts.controller";
import { DealArtifactsService } from "./deal-artifacts.service";
import { PublicArtifactsController } from "./public-artifacts.controller";

@Module({
  controllers: [DealArtifactsController, PublicArtifactsController],
  exports: [DealArtifactsService],
  imports: [AuthModule],
  providers: [DealArtifactsService],
})
export class DealArtifactsModule {}
