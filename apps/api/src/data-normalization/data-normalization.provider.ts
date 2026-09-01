import type { AddressSuggestion, NormalizedAddress } from "@max-contract/contracts";

export const DATA_NORMALIZATION_PROVIDER = Symbol("DATA_NORMALIZATION_PROVIDER");

export interface DataNormalizationProvider {
  normalizeAddress(address: string): Promise<NormalizedAddress>;
  suggestAddresses(query: string): Promise<AddressSuggestion[]>;
}
