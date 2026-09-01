import { ConfigService } from "@nestjs/config";

import { DadataDataNormalizationProvider } from "./dadata-data-normalization.provider";

describe("DadataDataNormalizationProvider", () => {
  const config = new ConfigService({
    DADATA_API_TOKEN: "token",
    DADATA_SECRET_KEY: "secret",
    DADATA_TIMEOUT_MS: 1_000,
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps only whitelisted address suggestion fields", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    jest.spyOn(global, "fetch").mockImplementation((input, init) => {
      capturedUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      capturedInit = init;
      return Promise.resolve(new Response(JSON.stringify({ suggestions: [{
      data: { fias_id: "fias", postal_code: "101000", secret: "ignored" },
      unrestricted_value: "101000, г Москва, ул Тверская, д 1",
      value: "г Москва, ул Тверская, д 1",
      }] }), { status: 200 }));
    });

    await expect(new DadataDataNormalizationProvider(config).suggestAddresses("Москва"))
      .resolves.toEqual([expect.objectContaining({ fiasId: "fias", postalCode: "101000" })]);
    expect(capturedUrl).toContain("suggest/address");
    expect(capturedInit?.headers).not.toHaveProperty("X-Secret");
  });

  it("uses the secret only for address cleanup and maps the internal format", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    jest.spyOn(global, "fetch").mockImplementation((input, init) => {
      capturedUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
      capturedInit = init;
      return Promise.resolve(new Response(JSON.stringify([{
      city_with_type: "г Москва",
      fias_id: "fias",
      qc_complete: 0,
      result: "101000, г Москва, ул Тверская, д 1",
      }]), { status: 200 }));
    });

    await expect(new DadataDataNormalizationProvider(config).normalizeAddress("Москва"))
      .resolves.toMatchObject({ fiasId: "fias", qualityCode: "0", source: "DADATA" });
    expect(capturedUrl).toContain("clean/address");
    expect(capturedInit?.headers).toHaveProperty("X-Secret", "secret");
  });
});
