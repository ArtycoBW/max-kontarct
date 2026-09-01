import { FakeDataNormalizationProvider } from "./fake-data-normalization.provider";

describe("FakeDataNormalizationProvider", () => {
  const provider = new FakeDataNormalizationProvider();

  it("normalizes whitespace without inventing address facts", async () => {
    await expect(provider.normalizeAddress("  г. Москва,   Тверская 1 ")).resolves.toMatchObject({
      fiasId: null,
      source: "MOCK",
      value: "г. Москва, Тверская 1",
    });
  });

  it("returns no suggestions for an unsafe short query", async () => {
    await expect(provider.suggestAddresses("мо")).resolves.toEqual([]);
  });
});
