import { Module } from "@nestjs/common";

import { DealStateMachineService } from "./deal-state-machine.service";

@Module({
  exports: [DealStateMachineService],
  providers: [DealStateMachineService],
})
export class DealsModule {}
