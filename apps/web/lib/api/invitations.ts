import type {
  ApproveDealVersionRequest,
  CreateDealInvitationRequest,
  DealApprovalResponse,
  DealInvitationResponse,
  DealWorkspaceResponse,
  JoinDealInvitationRequest,
  PublicDealInvitationResponse,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getPublicInvitation(
  publicCode: string,
): Promise<PublicDealInvitationResponse> {
  return apiRequest<PublicDealInvitationResponse>(
    `public/invitations/${encodeURIComponent(publicCode)}`,
  );
}

export function getDealWorkspace(dealId: string): Promise<DealWorkspaceResponse> {
  return apiRequest<DealWorkspaceResponse>(
    `deals/${encodeURIComponent(dealId)}/workspace`,
  );
}

export function createDealInvitation(
  dealId: string,
  body: CreateDealInvitationRequest,
): Promise<DealInvitationResponse> {
  return apiRequest<DealInvitationResponse>(
    `deals/${encodeURIComponent(dealId)}/invitations`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}

export function markDealInvitationSent(
  dealId: string,
  invitationId: string,
): Promise<DealInvitationResponse> {
  return apiRequest<DealInvitationResponse>(
    `deals/${encodeURIComponent(dealId)}/invitations/${encodeURIComponent(invitationId)}/sent`,
    { method: "POST" },
  );
}

export function revokeDealInvitation(
  dealId: string,
  invitationId: string,
): Promise<DealInvitationResponse> {
  return apiRequest<DealInvitationResponse>(
    `deals/${encodeURIComponent(dealId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
    { method: "POST" },
  );
}

export function joinDealInvitation(
  body: JoinDealInvitationRequest,
): Promise<DealWorkspaceResponse> {
  return apiRequest<DealWorkspaceResponse>("deal-invitations/join", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function approveDealVersion(
  dealId: string,
  versionId: string,
  body: ApproveDealVersionRequest,
): Promise<DealApprovalResponse> {
  return apiRequest<DealApprovalResponse>(
    `deals/${encodeURIComponent(dealId)}/versions/${encodeURIComponent(versionId)}/approve`,
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}
