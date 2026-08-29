export type AiJsonPrimitive = boolean | number | string | null;
export type AiJsonValue =
  | AiJsonPrimitive
  | AiJsonValue[]
  | { [key: string]: AiJsonValue };
export type AiJsonObject = { [key: string]: AiJsonValue };

export interface AiPromptDefinition {
  id: string;
  trustedInstruction: string;
  version: string;
}

export interface AiResponseSchema {
  description?: string;
  name: string;
  schema: AiJsonObject;
}

export interface AiStructuredRequest {
  output: AiResponseSchema;
  piiPaths?: string[];
  prompt: AiPromptDefinition;
  safetyIdentifier?: string;
  userData: AiJsonObject;
}

export interface AiTokenUsage {
  completionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
}

export interface AiGenerationMetadata {
  model: string;
  modelVersion: string;
  promptId: string;
  promptVersion: string;
  provider: "fake" | "yandex";
  providerRequestId: string | null;
  redactedPiiCount: number;
  usage: AiTokenUsage;
}

export interface AiStructuredResult<T extends AiJsonObject = AiJsonObject> {
  data: T;
  metadata: AiGenerationMetadata;
}

export interface AiProvider {
  generateStructured<T extends AiJsonObject = AiJsonObject>(
    request: AiStructuredRequest,
  ): Promise<AiStructuredResult<T>>;
}

export const AI_PROVIDER = Symbol("AI_PROVIDER");
