import { appendTranscript, speechConstructor, speechError } from "./speech-recognition";

describe("browser speech bridge", () => {
  it("is SSR safe", () => expect(speechConstructor()).toBeNull());
  it("keeps existing text, normalizes speech whitespace and caps length", () => {
    expect(appendTranscript("Задача: ", " сделать  презентацию\nв PDF")).toBe("Задача: сделать презентацию в PDF");
    expect(appendTranscript("  Старый текст ", "")).toBe("  Старый текст ");
    expect(appendTranscript("1234", "56789", 7)).toBe("1234 56");
  });
  it.each(["not-allowed", "service-not-allowed", "no-speech", "audio-capture", "language-not-supported", "network"])("explains %s without a raw exception", code => {
    expect(speechError(code).length).toBeGreaterThan(30);
    expect(speechError(code)).not.toContain(code);
  });
});
