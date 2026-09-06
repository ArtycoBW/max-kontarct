import { BadGatewayException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { SendOtpInput, SendOtpResult, SmsProvider } from "./sms.provider";

type SmscResponse = { error?: unknown; error_code?: unknown; id?: unknown };

export class SmscSmsProvider implements SmsProvider {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly login: string;
  private readonly password: string;
  private readonly sender: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>("SMSC_API_KEY");
    this.apiUrl = config.getOrThrow<string>("SMSC_API_URL");
    this.login = config.getOrThrow<string>("SMSC_LOGIN");
    this.password = config.getOrThrow<string>("SMSC_PASSWORD");
    this.sender = config.getOrThrow<string>("SMSC_SENDER");
    this.timeoutMs = config.getOrThrow<number>("SMSC_TIMEOUT_MS");
  }

  async sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/rest/send/`, {
        body: JSON.stringify({
          ...(this.apiKey ? { apikey: this.apiKey } : { login: this.login, psw: this.password }),
          mes: `Код подписания Макс-Контракт: ${input.code}`,
          phones: input.phone.replace(/^\+/, ""),
          ...(this.sender ? { sender: this.sender } : {}),
        }),
        headers: { "Content-Type": "application/json; charset=utf-8" },
        method: "POST",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw deliveryUnavailable();
    }
    const body = await readResponse(response);
    if (
      !response.ok || body.error_code !== undefined || body.error !== undefined ||
      !((typeof body.id === "string" && body.id.trim().length > 0) || (typeof body.id === "number" && Number.isFinite(body.id) && body.id > 0))
    ) {
      throw deliveryUnavailable();
    }
    return { channel: "SMSC", messageId: String(body.id) };
  }
}

async function readResponse(response: Response): Promise<SmscResponse> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return {};
    const value = body as Record<string, unknown>;
    return { error: value.error, error_code: value.error_code, id: value.id };
  } catch {
    return {};
  }
}

function deliveryUnavailable(): BadGatewayException {
  return new BadGatewayException({
    code: "OTP_DELIVERY_UNAVAILABLE",
    message: "Сервис SMS временно недоступен",
  });
}
