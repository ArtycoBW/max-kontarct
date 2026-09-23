import { canUploadSubject, hasCompletePassportProfile, requiredForParty } from "./document-policy";

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

  it("uses complete passport data in the profile instead of requiring an identity scan", () => {
    const profile = {
      birthDate: new Date("1990-01-01T00:00:00.000Z"), firstName: "Анна", lastName: "Примерова",
      passportDetails: { series: "12 34", number: "567890", issuedAt: "2020-01-02", issuer: "МВД", divisionCode: "123-456", birthPlace: "Казань", gender: "Ж" },
    };
    const deal = { initiatorUserId: "first", parties: [{ userId: "first", user: { profile } }], templateVersion };
    expect(hasCompletePassportProfile(profile)).toBe(true);
    expect(requiredForParty(deal, "first")).toEqual(["property"]);
  });

  it("still requires an identity scan when passport details are incomplete", () => {
    const deal = {
      parties: [{ userId: "first", user: { profile: { firstName: "Анна", lastName: "Примерова", birthDate: "1990-01-01", passportDetails: { series: "1234", number: "567890" } } } }],
      templateVersion,
    };
    expect(hasCompletePassportProfile(deal.parties[0]?.user.profile)).toBe(false);
    expect(requiredForParty(deal, "first")).toEqual(["passport", "property"]);
  });
});
