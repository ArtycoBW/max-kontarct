import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealStateMachineService } from "./deal-state-machine.service";
import { DealsController } from "./deals.controller";
import { DealsRepository } from "./deals.repository";
import { DealsService } from "./deals.service";

@Module({
  controllers: [DealsController],
  exports: [DealStateMachineService],
  imports: [AuthModule],
  providers: [DealStateMachineService, DealsRepository, DealsService],
})
export class DealsModule {}
