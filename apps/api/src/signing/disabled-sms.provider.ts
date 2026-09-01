import { ServiceUnavailableException } from "@nestjs/common";

import type { SendOtpResult, SmsProvider } from "./sms.provider";

export class DisabledSmsProvider implements SmsProvider {
  sendOtp(): Promise<SendOtpResult> {
    throw new ServiceUnavailableException({
      code: "SMS_PROVIDER_NOT_CONFIGURED",
      message: "Отправка кодов пока не настроена",
    });
  }
}
