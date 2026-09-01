import { calculateSha256, createPrivateObjectKey } from "./file-security";

describe("file security helpers", () => {
  it("creates a stable SHA-256 checksum", () => {
    expect(calculateSha256(Buffer.from("contract"))).toHaveLength(64);
    expect(calculateSha256(Buffer.from("contract"))).toBe(
      calculateSha256(Buffer.from("contract")),
    );
  });

  it("creates random private keys without source filenames", () => {
    const first = createPrivateObjectKey("deal-id");
    const second = createPrivateObjectKey("deal-id");
    expect(first).toMatch(/^private\/deals\/deal-id\/[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });
});
