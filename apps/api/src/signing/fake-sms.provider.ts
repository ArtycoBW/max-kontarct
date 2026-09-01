import { randomUUID } from "node:crypto";

import type { SendOtpResult, SmsProvider } from "./sms.provider";

export class FakeSmsProvider implements SmsProvider {
  sendOtp(): Promise<SendOtpResult> {
    return Promise.resolve({ channel: "FAKE", messageId: `fake-${randomUUID()}` });
  }
}
