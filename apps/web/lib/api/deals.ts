import type {
  CreateDealDraftRequest,
  DealDraftResponse,
  DealListResponse,
  UpdateDealDraftRequest,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function createDealDraft(
  request: CreateDealDraftRequest,
): Promise<DealDraftResponse> {
  return apiRequest<DealDraftResponse>("deals", {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function getDealDraft(dealId: string): Promise<DealDraftResponse> {
  return apiRequest<DealDraftResponse>(`deals/${encodeURIComponent(dealId)}`);
}

export function getDeals(): Promise<DealListResponse> {
  return apiRequest<DealListResponse>("deals");
}

export function updateDealDraft(
  dealId: string,
  request: UpdateDealDraftRequest,
): Promise<DealDraftResponse> {
  return apiRequest<DealDraftResponse>(
    `deals/${encodeURIComponent(dealId)}/draft`,
    {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
}
