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

  it("simulates the clarification lifecycle without calling YandexGPT", async () => {
    const provider = new FakeAiProvider(
      new AiOutputValidator(),
      new PiiRedactor(),
    );

    const first = await provider.generateStructured(
      clarificationRequest({}),
    );
    const completed = await provider.generateStructured(
      clarificationRequest({ utilitiesPayer: "tenant" }),
    );

    expect(first.data).toMatchObject({
      questions: [expect.objectContaining({ type: "single_choice" })],
      status: "NEED_MORE_INFO",
    });
    expect(completed.data).toEqual({
      questions: [],
      status: "READY_TO_GENERATE",
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

function clarificationRequest(
  clarificationAnswers: Record<string, string>,
): AiStructuredRequest {
  return {
    output: {
      name: "contract_clarification_v1",
      schema: {
        additionalProperties: false,
        properties: {
          questions: {
            items: {
              additionalProperties: false,
              properties: {
                description: { type: "string" },
                id: { type: "string" },
                label: { type: "string" },
                options: {
                  items: {
                    additionalProperties: false,
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                    },
                    required: ["label", "value"],
                    type: "object",
                  },
                  type: "array",
                },
                required: { type: "boolean" },
                type: {
                  enum: [
                    "single_choice",
                    "boolean",
                    "short_text",
                    "number",
                    "date",
                  ],
                  type: "string",
                },
              },
              required: [
                "description",
                "id",
                "label",
                "options",
                "required",
                "type",
              ],
              type: "object",
            },
            type: "array",
          },
          status: {
            enum: ["NEED_MORE_INFO", "READY_TO_GENERATE"],
            type: "string",
          },
        },
        required: ["questions", "status"],
        type: "object",
      },
    },
    prompt: {
      id: "contract-clarification",
      trustedInstruction: "Уточни условия договора.",
      version: "1.0.0",
    },
    userData: { clarificationAnswers },
  };
}
