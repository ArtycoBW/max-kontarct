import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import { MaxBotService } from "./max-bot.service";

describe("MaxBotService", () => {
  const values: Record<string, string> = {
    MAX_API_URL: "https://platform-api2.max.ru",
    MAX_BOT_TOKEN: "test-token",
    MAX_WEBHOOK_SECRET: "test-webhook-secret",
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects requests without the configured webhook secret", async () => {
    const service = new MaxBotService(config);

    await expect(
      service.handleUpdate("wrong-secret", {
        chat_id: 42,
        update_type: "bot_started",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("acknowledges unrelated updates without calling MAX API", async () => {
    const request = jest.spyOn(global, "fetch");
    const service = new MaxBotService(config);

    await service.handleUpdate("test-webhook-secret", {
      chat_id: 42,
      update_type: "message_created",
    });

    expect(request).not.toHaveBeenCalled();
  });

  it("sends an in-app launch button when the bot is started", async () => {
    const request = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user_id: 332_926_578,
            username: "max_contract_bot",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const service = new MaxBotService(config);

    await service.handleUpdate("test-webhook-secret", {
      chat_id: 42,
      update_type: "bot_started",
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "https://platform-api2.max.ru/me",
      expect.objectContaining({
        headers: { Authorization: "test-token" },
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "https://platform-api2.max.ru/messages?chat_id=42",
      expect.objectContaining({ method: "POST" }),
    );
    const requestBody = request.mock.calls[1]?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    if (typeof requestBody !== "string") {
      throw new Error("MAX request body must be JSON");
    }
    const body = JSON.parse(requestBody) as {
      attachments: Array<{
        payload: {
          buttons: Array<
            Array<{
              contact_id?: number;
              type: string;
              web_app?: string;
            }>
          >;
        };
      }>;
    };
    expect(body.attachments[0]?.payload.buttons[0]?.[0]?.type).toBe("open_app");
    expect(body.attachments[0]?.payload.buttons[0]?.[0]?.contact_id).toBe(
      332_926_578,
    );
    expect(body.attachments[0]?.payload.buttons[0]?.[0]?.web_app).toBe(
      "Открыть Макс-Контракт",
    );
  });
});
