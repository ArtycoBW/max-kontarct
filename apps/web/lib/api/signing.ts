import type {
  ConfirmDealSignatureRequest,
  DealSigningStateResponse,
  IssueSigningOtpRequest,
  IssueSigningOtpResponse,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getDealSigningState(dealId: string): Promise<DealSigningStateResponse> {
  return apiRequest(`deals/${encodeURIComponent(dealId)}/signing`);
}

export function issueDealSigningOtp(
  dealId: string,
  body: IssueSigningOtpRequest,
): Promise<IssueSigningOtpResponse> {
  return apiRequest(`deals/${encodeURIComponent(dealId)}/signing/otp`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function confirmDealSignature(
  dealId: string,
  body: ConfirmDealSignatureRequest,
): Promise<DealSigningStateResponse> {
  return apiRequest(`deals/${encodeURIComponent(dealId)}/signing/confirm`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}
