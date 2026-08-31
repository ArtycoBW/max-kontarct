import type {
  CreateDealVersionRequest,
  CreateDealDraftRequest,
  DealDraftResponse,
  DealListResponse,
  DealVersionListResponse,
  StartDealAgreementRequest,
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

export function getDealVersions(
  dealId: string,
): Promise<DealVersionListResponse> {
  return apiRequest<DealVersionListResponse>(
    `deals/${encodeURIComponent(dealId)}/versions`,
  );
}

export function startDealAgreement(
  dealId: string,
  request: StartDealAgreementRequest,
): Promise<DealDraftResponse> {
  return apiRequest<DealDraftResponse>(
    `deals/${encodeURIComponent(dealId)}/agreement/start`,
    {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function createDealVersion(
  dealId: string,
  request: CreateDealVersionRequest,
): Promise<DealDraftResponse> {
  return apiRequest<DealDraftResponse>(
    `deals/${encodeURIComponent(dealId)}/versions`,
    {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
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
