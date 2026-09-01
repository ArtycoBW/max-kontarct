import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuthModule } from "../auth/auth.module";
import { MaxBotModule } from "../max-bot/max-bot.module";
import { MaxBotService } from "../max-bot/max-bot.service";
import { DisabledSmsProvider } from "./disabled-sms.provider";
import { FakeSmsProvider } from "./fake-sms.provider";
import { MaxTestSmsProvider } from "./max-test-sms.provider";
import { OtpService } from "./otp.service";
import { SigningController } from "./signing.controller";
import { SigningService } from "./signing.service";
import { SMS_PROVIDER } from "./sms.provider";
import { SmscSmsProvider } from "./smsc-sms.provider";

@Module({
  controllers: [SigningController],
  exports: [OtpService, SMS_PROVIDER],
  imports: [AuthModule, MaxBotModule],
  providers: [
    OtpService,
    SigningService,
    {
      inject: [ConfigService, MaxBotService],
      provide: SMS_PROVIDER,
      useFactory: (config: ConfigService, maxBot: MaxBotService) => {
        const provider = config.getOrThrow<string>("SMS_PROVIDER");
        if (provider === "smsc") return new SmscSmsProvider(config);
        if (provider === "max-test") return new MaxTestSmsProvider(maxBot);
        if (provider === "fake") return new FakeSmsProvider();
        return new DisabledSmsProvider();
      },
    },
  ],
})
export class SigningModule {}
