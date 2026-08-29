import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  AiJsonObject,
  AiProvider,
  AiStructuredRequest,
  AiStructuredResult,
  AiTokenUsage,
} from "./ai-provider";
import { AiProviderError } from "./ai-provider.error";
import { AiOutputValidator } from "./ai-output.validator";
import { assertAiRequest, buildAiMessages } from "./ai-request.builder";
import { PiiRedactor } from "./pii-redactor";

const YANDEX_CHAT_COMPLETIONS_URL =
  "https://ai.api.cloud.yandex.net/v1/chat/completions";
const SAFE_TRANSPORT_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export type AiFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const YANDEX_AI_FETCH = Symbol("YANDEX_AI_FETCH");

interface YandexChatCompletionResponse {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown };
  }>;
  id?: unknown;
  usage?: {
    completion_tokens?: unknown;
    prompt_tokens?: unknown;
    total_tokens?: unknown;
  };
}

@Injectable()
export class YandexAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly folderId: string;
  private readonly maxRetries: number;
  private readonly maxTokens: number;
  private readonly model: string;
  private readonly retryDelayMs: number;
  private readonly temperature: number;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService,
    private readonly outputValidator: AiOutputValidator,
    private readonly piiRedactor: PiiRedactor,
    @Inject(YANDEX_AI_FETCH) private readonly fetcher: AiFetch,
  ) {
    this.apiKey = config.getOrThrow<string>("YANDEX_AI_API_KEY");
    this.folderId = config.getOrThrow<string>("YANDEX_AI_FOLDER_ID");
    this.maxRetries = config.getOrThrow<number>("YANDEX_AI_MAX_RETRIES");
    this.maxTokens = config.getOrThrow<number>("YANDEX_AI_MAX_TOKENS");
    this.model = config.getOrThrow<string>("YANDEX_AI_MODEL");
    this.retryDelayMs = config.getOrThrow<number>("YANDEX_AI_RETRY_DELAY_MS");
    this.temperature = config.getOrThrow<number>("YANDEX_AI_TEMPERATURE");
    this.timeoutMs = config.getOrThrow<number>("YANDEX_AI_TIMEOUT_MS");
  }

  async generateStructured<T extends AiJsonObject = AiJsonObject>(
    request: AiStructuredRequest,
  ): Promise<AiStructuredResult<T>> {
    assertAiRequest(request);
    this.outputValidator.assertSchema(request.output.name, request.output.schema);
    const redacted = this.piiRedactor.redact(request.userData, request.piiPaths);
    const modelUri = `gpt://${this.folderId}/${this.model}`;
    const body = {
      max_completion_tokens: this.maxTokens,
      messages: buildAiMessages(request, redacted.data),
      model: modelUri,
      n: 1,
      response_format: {
        json_schema: {
          description: request.output.description,
          name: request.output.name,
          schema: request.output.schema,
          strict: true,
        },
        type: "json_schema",
      },
      stream: false,
      temperature: this.temperature,
      ...(request.safetyIdentifier
        ? { safety_identifier: request.safetyIdentifier }
        : {}),
    };

    const response = await this.fetchWithSafeRetries(JSON.stringify(body));
    if (!response.ok) {
      throw new AiProviderError(
        "AI_PROVIDER_HTTP_ERROR",
        `YandexGPT вернул ошибку HTTP ${response.status}`,
      );
    }

    const providerResponse = await readProviderResponse(response);
    const choice = providerResponse.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string"
    ) {
      throw invalidProviderResponse();
    }

    return {
      data: this.outputValidator.parseAndValidate<T>(
        choice.message.content,
        request.output.schema,
      ),
      metadata: {
        model: modelUri,
        modelVersion: this.model,
        promptId: request.prompt.id,
        promptVersion: request.prompt.version,
        provider: "yandex",
        providerRequestId:
          response.headers.get("x-request-id") ?? stringValue(providerResponse.id),
        redactedPiiCount: redacted.redactedCount,
        usage: parseUsage(providerResponse.usage),
      },
    };
  }

  private async fetchWithSafeRetries(body: string): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.fetcher(YANDEX_CHAT_COMPLETIONS_URL, {
          body,
          headers: {
            Accept: "application/json",
            Authorization: `Api-Key ${this.apiKey}`,
            "Content-Type": "application/json",
            "OpenAI-Project": this.folderId,
          },
          method: "POST",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (isTimeoutError(error)) {
          throw new AiProviderError(
            "AI_PROVIDER_TIMEOUT",
            "Превышено время ожидания ответа YandexGPT",
          );
        }

        const retryable = isSafeTransportFailure(error);
        if (!retryable || attempt === this.maxRetries) {
          throw new AiProviderError(
            "AI_PROVIDER_TRANSPORT_ERROR",
            "Не удалось установить соединение с YandexGPT",
            retryable,
          );
        }
        await delay(this.retryDelayMs * 2 ** attempt);
      }
    }

    throw new AiProviderError(
      "AI_PROVIDER_TRANSPORT_ERROR",
      "Не удалось установить соединение с YandexGPT",
    );
  }
}

async function readProviderResponse(
  response: Response,
): Promise<YandexChatCompletionResponse> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw invalidProviderResponse();
  }

  if (!text || text.length > 1_000_000) throw invalidProviderResponse();
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isObject(parsed)) throw invalidProviderResponse();
    return parsed;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw invalidProviderResponse();
  }
}

function parseUsage(
  usage: YandexChatCompletionResponse["usage"],
): AiTokenUsage {
  return {
    completionTokens: integerValue(usage?.completion_tokens),
    promptTokens: integerValue(usage?.prompt_tokens),
    totalTokens: integerValue(usage?.total_tokens),
  };
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function isSafeTransportFailure(error: unknown): boolean {
  if (!isObject(error)) return false;
  const directCode = error.code;
  const causeCode = isObject(error.cause) ? error.cause.code : undefined;
  return (
    (typeof directCode === "string" && SAFE_TRANSPORT_ERROR_CODES.has(directCode)) ||
    (typeof causeCode === "string" && SAFE_TRANSPORT_ERROR_CODES.has(causeCode))
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function invalidProviderResponse(): AiProviderError {
  return new AiProviderError(
    "AI_PROVIDER_RESPONSE_INVALID",
    "YandexGPT вернул некорректный ответ",
  );
}
