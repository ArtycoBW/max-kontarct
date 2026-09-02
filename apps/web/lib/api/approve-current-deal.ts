import type { DealWorkspaceResponse } from "@max-contract/contracts";
import { ApiError } from "./client";
import { approveDealVersion, getDealWorkspace } from "./invitations";

export async function approveCurrentDeal(dealId: string, seen: DealWorkspaceResponse) {
  try {
    return await approveDealVersion(dealId, seen.versionId, { expectedDealUpdatedAt: seen.updatedAt });
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "DEAL_VERSION_CONFLICT") throw error;
    const latest = await getDealWorkspace(dealId);
    // Only another approval/timestamp may differ. Never approve revised content implicitly.
    const comparable = (content: DealWorkspaceResponse) => JSON.stringify({ ...content, approvals: null, updatedAt: null });
    if (latest.status !== "TERMS_REVIEW" || comparable(latest) !== comparable(seen)) throw error;
    return approveDealVersion(dealId, seen.versionId, { expectedDealUpdatedAt: latest.updatedAt });
  }
}
