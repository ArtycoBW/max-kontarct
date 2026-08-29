export type AiProviderErrorCode =
  | "AI_OUTPUT_INVALID"
  | "AI_OUTPUT_SCHEMA_INVALID"
  | "AI_OUTPUT_UNSAFE"
  | "AI_PROVIDER_HTTP_ERROR"
  | "AI_PROVIDER_RESPONSE_INVALID"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_TRANSPORT_ERROR"
  | "AI_REQUEST_INVALID";

export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
