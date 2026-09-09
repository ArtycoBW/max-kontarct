import { BadGatewayException } from "@nestjs/common";
import { DataNormalizationService } from "./data-normalization.service";

describe("DataNormalizationService", () => {
  it("retains an unverified manual address when the provider fails", async () => {
    const service = new DataNormalizationService({ normalizeAddress: jest.fn().mockRejectedValue(new BadGatewayException()), suggestAddresses: jest.fn() });
    await expect(service.normalizeAddress("  Москва, ул. Примерная, 1  ")).resolves.toMatchObject({ value: "Москва, ул. Примерная, 1", source: "MANUAL", fiasId: null, qualityCode: null });
  });
  it("does not conceal programming errors as provider outages", async () => {
    const service = new DataNormalizationService({ normalizeAddress: jest.fn().mockRejectedValue(new TypeError("bug")), suggestAddresses: jest.fn() });
    await expect(service.normalizeAddress("Москва, ул. Примерная, 1")).rejects.toThrow("bug");
  });
});
