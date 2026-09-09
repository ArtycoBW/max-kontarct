import type {
  AddressSuggestionListResponse,
  NormalizedAddress,
} from "@max-contract/contracts";
import { BadGatewayException, Inject, Injectable } from "@nestjs/common";

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

  async normalizeAddress(address: string): Promise<NormalizedAddress> {
    try {
      return await this.provider.normalizeAddress(address.trim());
    } catch (error) {
      // An unavailable provider is not proof that a user-entered address is invalid.
      // Keep the source explicit: this value has NOT been verified by DaData.
      if (!(error instanceof BadGatewayException)) throw error;
      return {
        value: address.trim(), source: "MANUAL", qualityCode: null,
        city: null, fiasId: null, house: null, kladrId: null,
        postalCode: null, region: null, street: null,
      };
    }
  }
}
