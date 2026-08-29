import { PiiRedactor } from "./pii-redactor";

describe("PiiRedactor", () => {
  it("replaces known fields, explicit paths and PII inside free text", () => {
    const result = new PiiRedactor().redact(
      {
        client: {
          fullName: "Иван Иванов",
          secret: "AA-42",
        },
        email: "ivan@example.com",
        note: "Позвонить +7 (999) 123-45-67 или написать second@example.org",
      },
      ["client.secret"],
    );
    const serialized = JSON.stringify(result.data);

    expect(serialized).not.toContain("Иван Иванов");
    expect(serialized).not.toContain("AA-42");
    expect(serialized).not.toContain("ivan@example.com");
    expect(serialized).not.toContain("+7 (999) 123-45-67");
    expect(serialized).not.toContain("second@example.org");
    expect(result.redactedCount).toBe(5);
  });

  it("does not mutate the source object", () => {
    const source = { phone: "+79991234567", purpose: "Аренда" };

    new PiiRedactor().redact(source);

    expect(source).toEqual({ phone: "+79991234567", purpose: "Аренда" });
  });
});
