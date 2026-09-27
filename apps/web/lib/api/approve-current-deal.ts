import type { DealWorkspaceResponse } from "@max-contract/contracts";
import { ApiError } from "./client";
import { approveDealVersion, getDealWorkspace } from "./invitations";

export async function approveCurrentDeal(dealId: string, seen: DealWorkspaceResponse) {
  try {
    return await approveDealVersion(dealId, seen.versionId, { expectedDealUpdatedAt: seen.updatedAt, ...(seen.requisites ? { expectedRequisitesHash: seen.requisites.hash } : {}) });
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "DEAL_VERSION_CONFLICT") throw error;
    const latest = await getDealWorkspace(dealId);
    // Approval timestamps and live presence are not contract content.
    // Never approve changed terms, identities or requisites implicitly.
    const comparable = (content: DealWorkspaceResponse) => JSON.stringify({ ...content, approvals: null, updatedAt: null, initiator: content.initiator ? { ...content.initiator, presence: null } : null, counterparty: content.counterparty ? { ...content.counterparty, presence: null } : null });
    if (latest.status !== "TERMS_REVIEW" || comparable(latest) !== comparable(seen)) throw error;
    return approveDealVersion(dealId, seen.versionId, { expectedDealUpdatedAt: latest.updatedAt, ...(seen.requisites ? { expectedRequisitesHash: seen.requisites.hash } : {}) });
  }
}
