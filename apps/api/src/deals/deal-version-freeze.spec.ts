import {
  canonicalSerialize,
  createContractNumber,
  hashFrozenSnapshot,
  type FrozenDealSnapshot,
} from "./deal-version-freeze";

describe("deal version freeze", () => {
  it("serializes nested objects with stable key ordering", () => {
    expect(canonicalSerialize({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }] }))
      .toBe('{"a":{"b":3,"y":2},"list":[{"c":5,"d":4}],"z":1}');
  });

  it("produces the same SHA-256 for equivalent snapshots", () => {
    const left = snapshot({ title: "Аренда", id: "deal-id" });
    const right = snapshot({ id: "deal-id", title: "Аренда" });
    expect(hashFrozenSnapshot(left)).toBe(hashFrozenSnapshot(right));
    expect(hashFrozenSnapshot(left)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates a stable human-readable contract number", () => {
    expect(createContractNumber(
      "12345678-aaaa-bbbb-cccc-123456789000",
      3,
      new Date("2026-09-01T12:00:00.000Z"),
    )).toBe("МК-20260901-12345678-V3");
  });

  it("binds passport and telephone changes into the v2 signature hash", () => {
    const value = snapshot({ id: "test", title: "Договор" });
    value.schemaVersion = "deal-signature-v2";
    value.parties = [{ role: "INITIATOR", userId: "u1", partyId: "p1", maxUserIdRef: null, verifiedPhoneRef: "phone1", verifiedPhone: "+79990000001",
      profile: { firstName: "Иван", lastName: "Тестов", middleName: null, birthDate: null, address: null, email: null, passport: { series: "1234", number: "567890", issuer: null, issuedAt: null, divisionCode: null, birthPlace: null, gender: null } } }];
    const original = hashFrozenSnapshot(value);
    value.parties[0]!.profile.passport!.number = "999999";
    expect(hashFrozenSnapshot(value)).not.toBe(original);
    value.parties[0]!.profile.passport!.number = "567890";
    expect(hashFrozenSnapshot(value)).toBe(original);
    value.parties[0]!.verifiedPhone = "+79990000002";
    expect(hashFrozenSnapshot(value)).not.toBe(original);
  });
});

function snapshot(deal: Record<string, unknown>): FrozenDealSnapshot {
  return {
    contract: { draft: { title: "Договор" }, number: "МК-1" },
    deal: {
      id: String(deal.id),
      templateSlug: "property-rental",
      templateTitle: "Аренда имущества",
      templateVersion: 1,
      title: String(deal.title),
      versionId: "version-id",
      versionNumber: 1,
    },
    frozenAt: "2026-09-01T12:00:00.000Z",
    parties: [],
    schemaVersion: "deal-signature-v1",
    terms: { answer: true },
  };
}
