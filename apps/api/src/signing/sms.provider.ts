export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

export type SmsDeliveryChannel = "FAKE" | "MAX_TEST" | "SMSC";

export interface SendOtpInput {
  code: string;
  maxUserId: string | null;
  phone: string;
}

export interface SendOtpResult {
  channel: SmsDeliveryChannel;
  messageId: string | null;
}

export interface SmsProvider {
  sendOtp(input: SendOtpInput): Promise<SendOtpResult>;
}
