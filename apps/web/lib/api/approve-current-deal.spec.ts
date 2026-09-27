import type { DealWorkspaceResponse } from "@max-contract/contracts";
import { ApiError } from "./client";
import { approveCurrentDeal } from "./approve-current-deal";
import { approveDealVersion, getDealWorkspace } from "./invitations";
jest.mock("./invitations");
const approve = jest.mocked(approveDealVersion);
const workspace = jest.mocked(getDealWorkspace);
const seen = { id: "deal", versionId: "version-1", title: "Аренда", status: "TERMS_REVIEW", updatedAt: "old", approvals: { totalApproved: 0 }, contractDraft: { title: "Договор" } } as DealWorkspaceResponse;
beforeEach(() => jest.resetAllMocks());

it("approves only the requisites hash the participant reviewed", async () => {
  const requisites = { hash: "a".repeat(64), frozen: false, parties: [] };
  approve.mockResolvedValue({} as never);
  await approveCurrentDeal("deal", { ...seen, requisites });
  expect(approve).toHaveBeenCalledWith("deal", "version-1", { expectedDealUpdatedAt: "old", expectedRequisitesHash: requisites.hash });
});

it("does not retry when passport details change", async () => {
  const requisites = { hash: "a".repeat(64), frozen: false, parties: [] };
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" }));
  workspace.mockResolvedValue({ ...seen, requisites: { ...requisites, hash: "b".repeat(64) } });
  await expect(approveCurrentDeal("deal", { ...seen, requisites })).rejects.toMatchObject({ code: "DEAL_VERSION_CONFLICT" });
  expect(approve).toHaveBeenCalledTimes(1);
});

it("retries once when only another participant's approval changed", async () => {
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" })).mockResolvedValueOnce({} as never);
  workspace.mockResolvedValue({ ...seen, updatedAt: "new", approvals: { ...seen.approvals, totalApproved: 1 } });
  await approveCurrentDeal("deal", seen);
  expect(approve).toHaveBeenLastCalledWith("deal", "version-1", { expectedDealUpdatedAt: "new" });
});

it("ignores live presence changes but keeps participant identity in the comparison", async () => {
  const initiator: DealWorkspaceResponse["initiator"] = { displayName: "Иван", role: "INITIATOR", profileCompleted: true, presence: { online: true, lastSeenAt: "old", source: "APP" } };
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" })).mockResolvedValueOnce({} as never);
  workspace.mockResolvedValue({ ...seen, updatedAt: "new", initiator: { ...initiator, presence: { online: false, lastSeenAt: "new", source: "APP" } } });
  await approveCurrentDeal("deal", { ...seen, initiator });
  expect(approve).toHaveBeenCalledTimes(2);
});

it("does not retry after a participant identity change", async () => {
  const initiator: DealWorkspaceResponse["initiator"] = { displayName: "Иван", role: "INITIATOR", profileCompleted: true };
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" }));
  workspace.mockResolvedValue({ ...seen, initiator: { ...initiator, displayName: "Пётр" } });
  await expect(approveCurrentDeal("deal", { ...seen, initiator })).rejects.toMatchObject({ code: "DEAL_VERSION_CONFLICT" });
  expect(approve).toHaveBeenCalledTimes(1);
});

it.each([{ versionId: "version-2" }, { title: "Другие условия" }, { status: "READY_TO_SIGN" }])("does not silently approve changed content: %j", async (changed) => {
  approve.mockRejectedValueOnce(new ApiError(409, { code: "DEAL_VERSION_CONFLICT" }));
  workspace.mockResolvedValue({ ...seen, ...changed } as DealWorkspaceResponse);
  await expect(approveCurrentDeal("deal", seen)).rejects.toMatchObject({ code: "DEAL_VERSION_CONFLICT" });
  expect(approve).toHaveBeenCalledTimes(1);
});
