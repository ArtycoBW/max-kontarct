import { BadGatewayException } from "@nestjs/common";

import { MaxBotService } from "../max-bot/max-bot.service";
import type { SendOtpInput, SendOtpResult, SmsProvider } from "./sms.provider";

export class MaxTestSmsProvider implements SmsProvider {
  constructor(private readonly maxBot: MaxBotService) {}

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    if (!input.maxUserId) throw deliveryUnavailable();
    const delivered = await this.maxBot.sendUserNotification(
      input.maxUserId,
      `Тестовый код подписания Макс-Контракт: ${input.code}. Никому не сообщайте его.`,
      undefined,
      "signing",
    );
    if (!delivered) throw deliveryUnavailable();
    return { channel: "MAX_TEST", messageId: null };
  }
}

function deliveryUnavailable(): BadGatewayException {
  return new BadGatewayException({
    code: "OTP_DELIVERY_UNAVAILABLE",
    message: "Не удалось отправить код подтверждения",
  });
}
