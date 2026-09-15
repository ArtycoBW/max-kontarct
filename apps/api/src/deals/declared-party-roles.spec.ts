import { declaredRoleTerm, readSubjectDocumentsParty } from "./declared-party-roles";

test("uses explicit roles even when the buyer created the deal", () => {
  expect(declaredRoleTerm("movable-property-sale", "COUNTERPARTY")).toBe("Инициатор — покупатель, контрагент — продавец.");
  expect(declaredRoleTerm("property-rental", "INITIATOR")).toBe("Инициатор — арендодатель, контрагент — арендатор.");
  expect(declaredRoleTerm("work-contract", null)).toBeNull();
});
test("preserves the choice through saved generation metadata and rejects unknown values", () => {
  expect(readSubjectDocumentsParty({ clarification: { subjectDocumentsParty: "COUNTERPARTY" } })).toBe("COUNTERPARTY");
  expect(readSubjectDocumentsParty({ subjectDocumentsParty: "buyer" })).toBeNull();
});
