import { appendTranscript, speechConstructor, speechDraft, speechError, type SpeechResult } from "./speech-recognition";

describe("browser speech bridge", () => {
  it("is SSR safe", () => expect(speechConstructor()).toBeNull());
  it("keeps existing text, normalizes speech whitespace and caps length", () => {
    expect(appendTranscript("Задача: ", " сделать  презентацию\nв PDF")).toBe("Задача: сделать презентацию в PDF");
    expect(appendTranscript("  Старый текст ", "")).toBe("  Старый текст ");
    expect(appendTranscript("1234", "56789", 7)).toBe("1234 56");
  });
  it.each(["not-allowed", "service-not-allowed", "no-speech", "audio-capture", "language-not-supported", "network", "aborted"])("explains %s without a raw exception", code => {
    expect(speechError(code).length).toBeGreaterThan(30);
    expect(speechError(code)).not.toContain(code);
  });
  it("matches the archive's sentence casing and pause punctuation", () => {
    expect(appendTranscript("", "нужно  сделать\nпрезентацию")).toBe("Нужно сделать презентацию");
    expect(appendTranscript("Нужно сделать", "Презентацию")).toBe("Нужно сделать презентацию");
    expect(appendTranscript("Нужно сделать.", "презентацию")).toBe("Нужно сделать. Презентацию");
    expect(appendTranscript("Первое условие", "Второе условие", 500, true)).toBe("Первое условие. Второе условие");
    expect(appendTranscript("Стоимость", "15000 рублей", 500, true)).toBe("Стоимость 15000 рублей");
  });
  const result = (transcript: string, isFinal: boolean): SpeechResult => ({ isFinal, 0: { transcript } });
  it("shows interim words in the input, replaces hypotheses and commits changed results once", () => {
    const update = speechDraft("Задача:", 500);
    expect(update({ resultIndex: 0, results: [result("Сделать приз", false)] }, 100)).toEqual({ value: "Задача: сделать приз", preview: "Сделать приз" });
    expect(update({ resultIndex: 0, results: [result("Сделать презентацию", false)] }, 200).value).toBe("Задача: сделать презентацию");
    const first = result("Сделать презентацию", true);
    expect(update({ resultIndex: 0, results: [first] }, 300).value).toBe("Задача: сделать презентацию");
    expect(update({ resultIndex: 0, results: [first] }, 350).value).toBe("Задача: сделать презентацию");
    expect(update({ resultIndex: 1, results: [first, result("На десять слайдов", false)] }, 400).value).toBe("Задача: сделать презентацию на десять слайдов");
    expect(update({ resultIndex: 1, results: [first, result("На десять слайдов", true)] }, 500).value).toBe("Задача: сделать презентацию на десять слайдов");
  });
  it("inserts the archive's sentence break after 1200ms and removes withdrawn interim words", () => {
    const update = speechDraft("", 500);
    const first = result("Первое условие", true);
    update({ resultIndex: 0, results: [first] }, 0);
    expect(update({ resultIndex: 1, results: [first, result("второе", false)] }, 1200).value).toBe("Первое условие. Второе");
    expect(update({ resultIndex: 1, results: [first] }, 1300).value).toBe("Первое условие");
    expect(update({ resultIndex: 1, results: [first, result("второе условие", true)] }, 1400).value).toBe("Первое условие. Второе условие");
  });
  it("caps both previews and committed text without sharing state between sessions", () => {
    const event = { resultIndex: 0, results: [result("abcdefghi", true)] };
    expect(speechDraft("1234", 7)(event)).toEqual({ value: "1234 ab", preview: "Abcdefg" });
    expect(speechDraft("", 20)(event).value).toBe("Abcdefghi");
  });
});
