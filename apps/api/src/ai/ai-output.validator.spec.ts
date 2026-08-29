import { AiOutputValidator } from "./ai-output.validator";
import type { AiJsonObject } from "./ai-provider";
import { AiProviderError, type AiProviderErrorCode } from "./ai-provider.error";

describe("AiOutputValidator", () => {
  let validator: AiOutputValidator;

  beforeEach(() => {
    validator = new AiOutputValidator();
  });

  it("accepts a JSON object that exactly matches the schema", () => {
    validator.assertSchema("generation_result_v1", responseSchema());

    expect(
      validator.parseAndValidate('{"status":"READY","summary":"Готово"}', responseSchema()),
    ).toEqual({ status: "READY", summary: "Готово" });
  });

  it("rejects additional properties and type coercion", () => {
    expectProviderError(() =>
      validator.parseAndValidate(
        '{"status":"READY","summary":7,"extra":true}',
        responseSchema(),
      ),
    "AI_OUTPUT_INVALID");
  });

  it("rejects HTML and executable payloads inside a valid object", () => {
    expectProviderError(() =>
      validator.parseAndValidate(
        '{"status":"READY","summary":"<script>alert(1)</script>"}',
        responseSchema(),
      ),
    "AI_OUTPUT_UNSAFE");
  });

  it("requires a strict top-level object schema", () => {
    expectProviderError(() =>
      validator.assertSchema("unsafe_schema", {
        properties: {},
        type: "object",
      }),
    "AI_OUTPUT_SCHEMA_INVALID");
  });
});

function responseSchema(): AiJsonObject {
  return {
    additionalProperties: false,
    properties: {
      status: { enum: ["READY"], type: "string" },
      summary: { minLength: 1, type: "string" },
    },
    required: ["status", "summary"],
    type: "object",
  };
}

function expectProviderError(
  action: () => unknown,
  code: AiProviderErrorCode,
): void {
  try {
    action();
    throw new Error("Ожидалась ошибка AI-провайдера");
  } catch (error) {
    expect(error).toBeInstanceOf(AiProviderError);
    if (error instanceof AiProviderError) expect(error.code).toBe(code);
  }
}
