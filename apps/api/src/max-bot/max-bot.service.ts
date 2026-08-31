import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";

const MAX_API_TIMEOUT_MS = 10_000;

type MaxBotUpdate = {
  chat_id?: unknown;
  update_type?: unknown;
};

type MaxBotIdentity = {
  userId: number;
  username: string;
};

function isMaxBotUpdate(value: unknown): value is MaxBotUpdate {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@Injectable()
export class MaxBotService {
  private readonly logger = new Logger(MaxBotService.name);
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly webhookSecret: string;
  private botIdentityPromise: Promise<MaxBotIdentity> | undefined;

  constructor(config: ConfigService) {
    this.apiUrl = config.getOrThrow<string>("MAX_API_URL").replace(/\/$/, "");
    this.token = config.getOrThrow<string>("MAX_BOT_TOKEN");
    this.webhookSecret = config.getOrThrow<string>("MAX_WEBHOOK_SECRET");
  }

  async handleUpdate(
    receivedSecret: string | undefined,
    update: unknown,
  ): Promise<void> {
    this.verifySecret(receivedSecret);

    if (!isMaxBotUpdate(update) || update.update_type !== "bot_started") {
      return;
    }

    const chatId = this.readChatId(update.chat_id);
    if (!chatId) {
      return;
    }

    await this.sendWelcomeMessage(chatId);
  }

  async getBotUsername(): Promise<string> {
    return (await this.getBotIdentity()).username;
  }

  async createMiniAppDeeplink(payload: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(payload)) {
      throw new Error("Некорректный параметр запуска мини-приложения MAX");
    }
    return `https://max.ru/${encodeURIComponent(await this.getBotUsername())}?startapp=${encodeURIComponent(payload)}`;
  }

  async sendUserNotification(
    maxUserId: string,
    text: string,
    payload?: string,
  ): Promise<boolean> {
    if (!/^\d{1,20}$/.test(maxUserId)) return false;

    try {
      const deeplink = payload
        ? await this.createMiniAppDeeplink(payload)
        : undefined;
      const response = await fetch(
        `${this.apiUrl}/messages?user_id=${encodeURIComponent(maxUserId)}`,
        {
          body: JSON.stringify({
            ...(deeplink
              ? {
                  attachments: [
                    {
                      payload: {
                        buttons: [
                          [
                            {
                              text: "Открыть сделку",
                              type: "link",
                              url: deeplink,
                            },
                          ],
                        ],
                      },
                      type: "inline_keyboard",
                    },
                  ],
                }
              : {}),
            text,
          }),
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(MAX_API_TIMEOUT_MS),
        },
      );
      if (response.ok) return true;
      this.logger.warn(
        { maxUserId, statusCode: response.status },
        "MAX rejected a deal notification",
      );
    } catch {
      this.logger.warn({ maxUserId }, "MAX deal notification was not delivered");
    }
    return false;
  }

  private readChatId(value: unknown): string | null {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value !== 0 ? String(value) : null;
    }

    if (typeof value === "string" && /^-?\d{1,20}$/.test(value)) {
      return value;
    }

    return null;
  }

  private async sendWelcomeMessage(chatId: string): Promise<void> {
    const botIdentity = await this.getBotIdentity();
    let response: Response;

    try {
      response = await fetch(
        `${this.apiUrl}/messages?chat_id=${encodeURIComponent(chatId)}`,
        {
          body: JSON.stringify({
            attachments: [
              {
                payload: {
                  buttons: [
                    [
                      {
                        contact_id: botIdentity.userId,
                        text: "Открыть Макс-Контракт",
                        type: "open_app",
                        web_app: "Открыть Макс-Контракт",
                      },
                    ],
                  ],
                },
                type: "inline_keyboard",
              },
            ],
            text: "Макс-Контракт помогает создавать и согласовывать договоры прямо в MAX.",
          }),
          headers: {
            Authorization: this.token,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(MAX_API_TIMEOUT_MS),
        },
      );
    } catch {
      throw new BadGatewayException({
        code: "MAX_BOT_API_UNAVAILABLE",
        message: "MAX не принял событие запуска бота",
      });
    }

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      this.logger.error(
        {
          responseBody,
          statusCode: response.status,
        },
        "MAX rejected the welcome message",
      );
      throw new BadGatewayException({
        code: "MAX_BOT_MESSAGE_REJECTED",
        message: "MAX не принял приветственное сообщение",
      });
    }
  }

  private getBotIdentity(): Promise<MaxBotIdentity> {
    this.botIdentityPromise ??= this.fetchBotIdentity().catch((error) => {
      this.botIdentityPromise = undefined;
      throw error;
    });

    return this.botIdentityPromise;
  }

  private async fetchBotIdentity(): Promise<MaxBotIdentity> {
    let response: Response;

    try {
      response = await fetch(`${this.apiUrl}/me`, {
        headers: { Authorization: this.token },
        signal: AbortSignal.timeout(MAX_API_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException({
        code: "MAX_BOT_API_UNAVAILABLE",
        message: "Не удалось получить данные бота MAX",
      });
    }

    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1_000);
      this.logger.error(
        {
          responseBody,
          statusCode: response.status,
        },
        "MAX rejected the bot identity request",
      );
      throw new BadGatewayException({
        code: "MAX_BOT_IDENTITY_REJECTED",
        message: "MAX не вернул данные бота",
      });
    }

    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("user_id" in body) ||
      typeof body.user_id !== "number" ||
      !Number.isSafeInteger(body.user_id) ||
      body.user_id <= 0 ||
      !("username" in body) ||
      typeof body.username !== "string" ||
      body.username.trim().length === 0
    ) {
      throw new BadGatewayException({
        code: "MAX_BOT_IDENTITY_INVALID",
        message: "MAX вернул некорректные данные бота",
      });
    }

    const identity = {
      userId: body.user_id,
      username: body.username.trim(),
    };
    this.logger.log(
      {
        botUserId: identity.userId,
        botUsername: identity.username,
      },
      "MAX bot identity resolved",
    );
    return identity;
  }

  private verifySecret(receivedSecret: string | undefined): void {
    if (!receivedSecret) {
      throw new UnauthorizedException({
        code: "MAX_WEBHOOK_UNAUTHORIZED",
        message: "Некорректная подпись webhook MAX",
      });
    }

    const actual = Buffer.from(receivedSecret, "utf8");
    const expected = Buffer.from(this.webhookSecret, "utf8");

    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new UnauthorizedException({
        code: "MAX_WEBHOOK_UNAUTHORIZED",
        message: "Некорректная подпись webhook MAX",
      });
    }
  }
}
