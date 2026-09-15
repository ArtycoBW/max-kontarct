import { canUploadSubject, requiredForParty } from "./document-policy";

describe("document responsibilities", () => {
  const templateVersion = { documentRequirements: [
    { id: "passport", key: "identity_document", required: true },
    { id: "property", key: "property_document", required: true },
  ] };
  it.each(["INITIATOR", "COUNTERPARTY"])("uses explicit responsibility %s, not who opened the deal", subjectDocumentsParty => {
    const deal = { initiatorUserId: "first", templateVersion, versions: [{ terms: { subjectDocumentsParty } }] };
    const supplier = subjectDocumentsParty === "INITIATOR" ? "first" : "second";
    const customer = supplier === "first" ? "second" : "first";
    expect(requiredForParty(deal, supplier)).toEqual(["passport", "property"]);
    expect(requiredForParty(deal, customer)).toEqual(["passport"]);
    expect(canUploadSubject(deal, customer)).toBe(false);
  });
  it("does not silently reinterpret roles in old deals", () => {
    expect(requiredForParty({ templateVersion }, "first")).toEqual(["passport", "property"]);
  });
});
