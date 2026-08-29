import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ConfigService } from "@nestjs/config";
import dotenv from "dotenv";

import type { AiProvider, AiStructuredRequest } from "./ai-provider";
import { AiProviderError } from "./ai-provider.error";
import { AiOutputValidator } from "./ai-output.validator";
import { FakeAiProvider } from "./fake-ai.provider";
import { PiiRedactor } from "./pii-redactor";
import { YandexAiProvider } from "./yandex-ai.provider";
import { validateEnvironment } from "../config/environment";

async function main(): Promise<void> {
  loadEnvironmentFiles();
  const environment = validateEnvironment(process.env);
  const config = new ConfigService(environment);
  const outputValidator = new AiOutputValidator();
  const piiRedactor = new PiiRedactor();
  const provider: AiProvider =
    config.getOrThrow<string>("AI_PROVIDER") === "yandex"
      ? new YandexAiProvider(
          config,
          outputValidator,
          piiRedactor,
          globalThis.fetch.bind(globalThis),
        )
      : new FakeAiProvider(outputValidator, piiRedactor);

  const result = await provider.generateStructured(smokeRequest());
  process.stdout.write(
    `${JSON.stringify(
      {
        data: result.data,
        model: result.metadata.model,
        promptVersion: result.metadata.promptVersion,
        provider: result.metadata.provider,
        redactedPiiCount: result.metadata.redactedPiiCount,
      },
      null,
      2,
    )}\n`,
  );
}

function loadEnvironmentFiles(): void {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) dotenv.config({ path, quiet: true });
  }
}

function smokeRequest(): AiStructuredRequest {
  return {
    output: {
      description: "Результат технической проверки структурированной генерации",
      name: "ai_smoke_result_v1",
      schema: {
        additionalProperties: false,
        properties: {
          status: { enum: ["OK"], type: "string" },
          summary: { maxLength: 160, minLength: 1, type: "string" },
        },
        required: ["status", "summary"],
        type: "object",
      },
    },
    prompt: {
      id: "ai-smoke",
      trustedInstruction:
        "Верни статус OK и краткое подтверждение успешной проверки на русском языке.",
      version: "1.0.0",
    },
    userData: {
      email: "qa@example.com",
      scenario: "Проверка структурированного ответа",
    },
  };
}

void main().catch((error: unknown) => {
  const message =
    error instanceof AiProviderError
      ? `${error.code}: ${error.message}`
      : error instanceof Error
        ? error.message
        : "Неизвестная ошибка";
  process.stderr.write(`Проверка AI не пройдена: ${message}\n`);
  process.exitCode = 1;
});
