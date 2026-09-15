import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { MaxBotModule } from "../max-bot/max-bot.module";
import {
  DealInvitationsController,
  JoinDealInvitationsController,
  PublicDealInvitationsController,
} from "./deal-invitations.controller";
import { DealInvitationsService } from "./deal-invitations.service";
import { DealStateMachineService } from "./deal-state-machine.service";
import { DealsController } from "./deals.controller";
import { DealsRepository } from "./deals.repository";
import { DealsService } from "./deals.service";
import { DealMessagesController } from "./deal-messages.controller";
import { DealMessagesService } from "./deal-messages.service";

@Module({
  controllers: [
    DealsController,
    DealMessagesController,
    DealInvitationsController,
    JoinDealInvitationsController,
    PublicDealInvitationsController,
  ],
  exports: [DealStateMachineService],
  imports: [AuthModule, MaxBotModule],
  providers: [
    DealInvitationsService,
    DealStateMachineService,
    DealsRepository,
    DealsService,
    DealMessagesService,
  ],
})
export class DealsModule {}
