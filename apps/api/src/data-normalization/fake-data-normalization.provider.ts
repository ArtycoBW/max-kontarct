import type { AddressSuggestion, NormalizedAddress } from "@max-contract/contracts";
import { Injectable } from "@nestjs/common";

import type { DataNormalizationProvider } from "./data-normalization.provider";

@Injectable()
export class FakeDataNormalizationProvider implements DataNormalizationProvider {
  normalizeAddress(address: string): Promise<NormalizedAddress> {
    const value = normalizeWhitespace(address);
    return Promise.resolve({
      city: null,
      fiasId: null,
      house: null,
      kladrId: null,
      postalCode: null,
      qualityCode: "0",
      region: null,
      source: "MOCK",
      street: null,
      value,
    });
  }

  suggestAddresses(query: string): Promise<AddressSuggestion[]> {
    const value = normalizeWhitespace(query);
    if (value.length < 3) return Promise.resolve([]);
    return Promise.resolve([{
      city: null,
      fiasId: null,
      house: null,
      postalCode: null,
      region: null,
      street: null,
      unrestrictedValue: value,
      value,
    }]);
  }
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
