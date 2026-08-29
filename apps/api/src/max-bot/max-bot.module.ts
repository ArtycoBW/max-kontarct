import { Module } from "@nestjs/common";

import { MaxBotController } from "./max-bot.controller";
import { MaxBotService } from "./max-bot.service";

@Module({
  controllers: [MaxBotController],
  providers: [MaxBotService],
})
export class MaxBotModule {}
