import { AiOutputValidator } from "./ai-output.validator";
import type { AiStructuredRequest } from "./ai-provider";
import { FakeAiProvider } from "./fake-ai.provider";
import { PiiRedactor } from "./pii-redactor";

describe("FakeAiProvider", () => {
  it("returns deterministic schema-valid data and version metadata", async () => {
    const provider = new FakeAiProvider(
      new AiOutputValidator(),
      new PiiRedactor(),
    );

    await expect(provider.generateStructured(request())).resolves.toEqual({
      data: {
        status: "READY",
        summary: "Демонстрационное значение",
      },
      metadata: {
        model: "fake-yandexgpt",
        modelVersion: "fake-v1",
        promptId: "contract-generation",
        promptVersion: "1.0.0",
        provider: "fake",
        providerRequestId: null,
        redactedPiiCount: 1,
        usage: {
          completionTokens: 0,
          promptTokens: 0,
          totalTokens: 0,
        },
      },
    });
  });
});

function request(): AiStructuredRequest {
  return {
    output: {
      name: "generation_result_v1",
      schema: {
        additionalProperties: false,
        properties: {
          status: { enum: ["READY"], type: "string" },
          summary: { minLength: 1, type: "string" },
        },
        required: ["status", "summary"],
        type: "object",
      },
    },
    prompt: {
      id: "contract-generation",
      trustedInstruction: "Подготовь структурированный результат.",
      version: "1.0.0",
    },
    userData: { email: "client@example.com", purpose: "Аренда" },
  };
}
