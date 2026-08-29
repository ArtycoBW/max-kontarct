import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";

import { MaxBotService } from "./max-bot.service";

@Controller("max-bot")
export class MaxBotController {
  constructor(private readonly maxBot: MaxBotService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async receiveUpdate(
    @Headers("x-max-bot-api-secret") secret: string | undefined,
    @Body() update: unknown,
  ): Promise<{ success: true }> {
    await this.maxBot.handleUpdate(secret, update);
    return { success: true };
  }
}
