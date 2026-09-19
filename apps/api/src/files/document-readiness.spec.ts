import { documentStage, loadDocumentStage } from "./document-readiness";

const identity = { id: "identity", key: "identity_document", required: true };
const subject = { id: "subject", key: "property_photos", required: true };
const accepted = (ownerUserId: string, requirementId = "identity") => ({ ownerUserId, requirementId, reviewStatus: "ACCEPTED" });
const deal = (files = [accepted("seller"), accepted("buyer")]) => ({
  initiatorUserId: "seller", parties: [{ userId: "seller" }, { userId: "buyer" }],
  versions: [{ terms: { subjectDocumentsParty: "INITIATOR" } }],
  templateVersion: { documentRequirements: [identity] }, files,
});

describe("document stage when entering agreement", () => {
  it("uses documents accepted before agreement started", () => expect(documentStage(deal())).toBe("TERMS_REVIEW"));
  it.each([[], [accepted("seller")], [accepted("buyer")]].map(files => ({ files })))("waits for missing mandatory files: %j", ({ files }) => {
    expect(documentStage(deal(files))).toBe("DOCUMENTS_PENDING");
  });
  it("waits for review of uploaded documents", () => {
    expect(documentStage(deal([accepted("seller"), { ...accepted("buyer"), reviewStatus: "PENDING" }]))).toBe("DOCUMENTS_REVIEW");
  });
  it("does not count rejected documents as submitted", () => {
    expect(documentStage(deal([accepted("seller"), { ...accepted("buyer"), reviewStatus: "REJECTED" }]))).toBe("DOCUMENTS_PENDING");
  });
  it("accepts an approved replacement despite an older rejected file", () => {
    expect(documentStage(deal([...deal().files, { ...accepted("buyer"), reviewStatus: "REJECTED" }]))).toBe("TERMS_REVIEW");
  });
  it.each([[], [{ userId: "seller" }]].map(parties => ({ parties })))("never opens approval without both parties: %j", ({ parties }) => {
    expect(documentStage({ ...deal(), parties, templateVersion: { documentRequirements: [] } })).toBe("DOCUMENTS_PENDING");
  });
  it("opens approval without mandatory requirements", () => {
    expect(documentStage({ ...deal([]), templateVersion: { documentRequirements: [{ ...subject, required: false }] } })).toBe("TERMS_REVIEW");
  });
  it.each(["INITIATOR", "COUNTERPARTY"])("requires subject files only from %s, identity from both", responsible => {
    const data = { ...deal(), versions: [{ terms: { subjectDocumentsParty: responsible } }], templateVersion: { documentRequirements: [identity, subject] } };
    expect(documentStage(data)).toBe("DOCUMENTS_PENDING");
    const owner = responsible === "INITIATOR" ? "seller" : "buyer";
    expect(documentStage({ ...data, files: [...data.files, accepted(owner, "subject")] })).toBe("TERMS_REVIEW");
    expect(documentStage({ ...data, files: [...data.files, accepted(owner === "seller" ? "buyer" : "seller", "subject")] })).toBe("DOCUMENTS_PENDING");
  });
  it("retains legacy per-party policy if responsibility was never set", () => {
    const data = { ...deal(), versions: [{ terms: {} }], templateVersion: { documentRequirements: [subject] }, files: [accepted("seller", "subject")] };
    expect(documentStage(data)).toBe("DOCUMENTS_PENDING");
    expect(documentStage({ ...data, files: [...data.files, accepted("buyer", "subject")] })).toBe("TERMS_REVIEW");
  });
  it("does not count unrelated attachments or another user's documents", () => {
    expect(documentStage(deal([accepted("seller"), accepted("stranger"), accepted("buyer", "other")]))).toBe("DOCUMENTS_PENDING");
  });
  it("loads the current version and requirement files only", async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(deal());
    await expect(loadDocumentStage({ deal: { findUniqueOrThrow } } as never, "deal")).resolves.toBe("TERMS_REVIEW");
    expect(findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "deal" } }));
  });
});
