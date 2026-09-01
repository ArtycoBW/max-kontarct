import type {
  AddressSuggestionListResponse,
  NormalizedAddress,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getAddressSuggestions(
  query: string,
): Promise<AddressSuggestionListResponse> {
  return apiRequest(`data-normalization/addresses/suggestions?query=${encodeURIComponent(query)}`);
}

export function normalizeAddress(address: string): Promise<NormalizedAddress> {
  return apiRequest("data-normalization/addresses/normalize", {
    body: JSON.stringify({ address }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}
