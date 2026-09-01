import { validateEnvironment } from "./environment";

describe("validateEnvironment AI settings", () => {
  it("uses FakeAiProvider defaults in development", () => {
    expect(validateEnvironment({ NODE_ENV: "development" })).toMatchObject({
      AI_PROVIDER: "fake",
      YANDEX_AI_MAX_RETRIES: 1,
      YANDEX_AI_MAX_TOKENS: 1200,
      YANDEX_AI_MODEL: "yandexgpt-5.1",
      YANDEX_AI_TEMPERATURE: 0.1,
      YANDEX_AI_TIMEOUT_MS: 20_000,
    });
  });

  it("requires Yandex credentials when the real provider is selected", () => {
    expect(() =>
      validateEnvironment({ AI_PROVIDER: "yandex", NODE_ENV: "development" }),
    ).toThrow("YANDEX_AI_API_KEY and YANDEX_AI_FOLDER_ID");
  });

  it("rejects unsafe generation settings", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        YANDEX_AI_TEMPERATURE: "0.8",
      }),
    ).toThrow("YANDEX_AI_TEMPERATURE");
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        YANDEX_AI_MAX_RETRIES: "10",
      }),
    ).toThrow("YANDEX_AI_MAX_RETRIES");
  });

  it("requires a webhook secret in production", () => {
    expect(() => validateEnvironment({ NODE_ENV: "production" })).toThrow(
      "MAX_WEBHOOK_SECRET",
    );
  });

  it("uses a mock address provider by default and validates DaData credentials", () => {
    expect(validateEnvironment({ NODE_ENV: "development" })).toMatchObject({
      DATA_NORMALIZATION_PROVIDER: "mock",
      DADATA_TIMEOUT_MS: 5_000,
    });
    expect(() => validateEnvironment({
      DATA_NORMALIZATION_PROVIDER: "dadata",
      NODE_ENV: "development",
    })).toThrow("DADATA_API_TOKEN and DADATA_SECRET_KEY");
  });
});
