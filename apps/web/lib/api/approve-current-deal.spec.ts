import type { DealWorkspaceResponse } from "@max-contract/contracts";
import { ApiError } from "./client";
import { approveCurrentDeal } from "./approve-current-deal";
import { approveDealVersion, getDealWorkspace } from "./invitations";
jest.mock("./invitations");
const approve = jest.mocked(approveDealVersion);
const workspace = jest.mocked(getDealWorkspace);
const seen = { id: "deal", versionId: "version-1", title: "Аренда", status: "TERMS_REVIEW", updatedAt: "old", approvals: { totalApproved: 0 }, contractDraft: { title: "Договор" } } as DealWorkspaceResponse;
beforeEach(() => jest.resetAllMocks());

it("retries once when only another participant's approval changed", async () => {
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" })).mockResolvedValueOnce({} as never);
  workspace.mockResolvedValue({ ...seen, updatedAt: "new", approvals: { ...seen.approvals, totalApproved: 1 } });
  await approveCurrentDeal("deal", seen);
  expect(approve).toHaveBeenLastCalledWith("deal", "version-1", { expectedDealUpdatedAt: "new" });
});

it.each([{ versionId: "version-2" }, { title: "Другие условия" }, { status: "READY_TO_SIGN" }])("does not silently approve changed content: %j", async (changed) => {
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" }));
  workspace.mockResolvedValue({ ...seen, ...changed } as DealWorkspaceResponse);
  await expect(approveCurrentDeal("deal", seen)).rejects.toMatchObject({ code: "DEAL_VERSION_CONFLICT" });
  expect(approve).toHaveBeenCalledTimes(1);
});
