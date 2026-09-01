import type {
  AddressSuggestionListResponse,
  NormalizedAddress,
} from "@max-contract/contracts";
import { Inject, Injectable } from "@nestjs/common";

import {
  DATA_NORMALIZATION_PROVIDER,
  type DataNormalizationProvider,
} from "./data-normalization.provider";

@Injectable()
export class DataNormalizationService {
  constructor(
    @Inject(DATA_NORMALIZATION_PROVIDER)
    private readonly provider: DataNormalizationProvider,
  ) {}

  async suggestAddresses(query: string): Promise<AddressSuggestionListResponse> {
    return { items: await this.provider.suggestAddresses(query.trim()) };
  }

  normalizeAddress(address: string): Promise<NormalizedAddress> {
    return this.provider.normalizeAddress(address.trim());
  }
}
