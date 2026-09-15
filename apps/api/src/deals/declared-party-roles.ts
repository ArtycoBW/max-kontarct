import type { DealPartyRole } from "@max-contract/contracts";

export function readSubjectDocumentsParty(metadata: unknown): DealPartyRole | null {
  if (!metadata || typeof metadata !== "object") return null;
  if ("clarification" in metadata) return readSubjectDocumentsParty(metadata.clarification);
  if (!("subjectDocumentsParty" in metadata)) return null;
  return metadata.subjectDocumentsParty === "INITIATOR" || metadata.subjectDocumentsParty === "COUNTERPARTY" ? metadata.subjectDocumentsParty : null;
}

export function declaredRoleTerm(slug: string, party: DealPartyRole | null): string | null {
  if (!party) return null;
  const roles: Record<string, [string, string]> = {
    "movable-property-sale": ["продавец", "покупатель"], "property-rental": ["арендодатель", "арендатор"],
    "work-contract": ["исполнитель", "заказчик"], "paid-services": ["исполнитель", "заказчик"], "personal-loan": ["займодавец", "заёмщик"],
  };
  const pair = roles[slug];
  if (!pair) return `Материалы предмета сделки предоставляет ${party === "INITIATOR" ? "инициатор" : "контрагент"}.`;
  return `Инициатор — ${pair[party === "INITIATOR" ? 0 : 1]}, контрагент — ${pair[party === "INITIATOR" ? 1 : 0]}.`;
}
