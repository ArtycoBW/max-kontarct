import { DealsRepository } from "./deals.repository";

describe("starting agreement with existing files", () => {
  const input = { dealId: "deal", userId: "seller", expectedVersionId: "version", expectedUpdatedAt: new Date(), versionNumber: 1, nextStatus: "INVITATION_READY" as const };
  const required = { id: "identity", key: "identity_document", required: true };
  function setup(fileStatuses: string[], joined = true) {
    const record = {
      initiatorUserId: "seller", parties: [{ userId: "seller" }, { userId: "buyer" }], versions: [{ terms: {} }],
      templateVersion: { documentRequirements: [required] },
      files: fileStatuses.map((reviewStatus, index) => ({ ownerUserId: index === 0 ? "seller" : "buyer", requirementId: required.id, reviewStatus })),
    };
    const tx = {
      deal: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue(record), findUnique: jest.fn() },
      dealParty: { count: jest.fn().mockResolvedValue(joined ? 1 : 0) },
      dealInvitation: { count: jest.fn().mockResolvedValue(joined ? 0 : 1) },
      auditEvent: { create: jest.fn() },
      dealVersion: { create: jest.fn().mockResolvedValue({ id: "version-2" }) },
      dealApproval: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const repository = new DealsRepository({ $transaction: (callback: (transaction: unknown) => unknown) => callback(tx) } as never);
    return { tx, repository };
  }
  it.each([
    [["ACCEPTED", "ACCEPTED"], "TERMS_REVIEW"],
    [["ACCEPTED", "PENDING"], "DOCUMENTS_REVIEW"],
    [["ACCEPTED", "REJECTED"], "DOCUMENTS_PENDING"],
    [["ACCEPTED"], "DOCUMENTS_PENDING"],
  ])("starts with %j at %s", async (statuses, status) => {
    const { tx, repository } = setup(statuses);
    await repository.startAgreement(input);
    expect(tx.deal.update).toHaveBeenCalledWith({ where: { id: "deal" }, data: { status } });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });
  it("keeps an unaccepted invitation without prematurely opening approval", async () => {
    const { tx, repository } = setup(["ACCEPTED", "ACCEPTED"], false);
    await repository.startAgreement(input);
    expect(tx.deal.update).toHaveBeenCalledWith({ where: { id: "deal" }, data: { status: "INVITATION_READY" } });
    expect(tx.deal.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it("rejects repeated or stale starts before changing status or auditing", async () => {
    const { tx, repository } = setup(["ACCEPTED", "ACCEPTED"]);
    tx.deal.updateMany.mockResolvedValue({ count: 0 });
    await expect(repository.startAgreement(input)).resolves.toBeNull();
    expect(tx.deal.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.deal.update).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
  it.each(["ACCEPTED", "PENDING", "REJECTED"])("rechecks files and supersedes old approvals on a new version (%s)", async reviewStatus => {
    const { tx, repository } = setup(["ACCEPTED", reviewStatus]);
    await repository.createVersion({ dealId: "deal", userId: "seller", currentVersionId: "version", expectedUpdatedAt: input.expectedUpdatedAt,
      currentStatus: "READY_TO_SIGN", nextStatus: "TERMS_REVIEW", versionNumber: 2, terms: {}, contractDraft: {}, changeSummary: "Уточнение срока", sourceGenerationId: "generation" });
    expect(tx.dealApproval.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { dealId: "deal", status: "APPROVED" } }));
    expect(tx.deal.update).toHaveBeenCalledWith({ where: { id: "deal" }, data: { status: reviewStatus === "ACCEPTED" ? "TERMS_REVIEW" : reviewStatus === "PENDING" ? "DOCUMENTS_REVIEW" : "DOCUMENTS_PENDING" } });
  });
});
