type Requirement = { id: string; required: boolean; key?: string; title?: string };
type DealPolicyInput = {
  initiatorUserId?: string;
  versions?: Array<{ terms?: unknown }>;
  templateVersion: { documentRequirements: Requirement[] };
};

export function isPersonalRequirement(requirement: { key?: string; title?: string } | null) {
  return requirement !== null && /(passport|identity|personal|удостовер|паспорт)/iu.test(`${requirement.key ?? ""} ${requirement.title ?? ""}`);
}

/** Unmigrated deals retain their former policy until a party is explicitly chosen. */
export function canUploadSubject(deal: DealPolicyInput, userId: string): boolean {
  const terms = deal.versions?.[0]?.terms;
  const responsible = terms && typeof terms === "object" && "subjectDocumentsParty" in terms ? terms.subjectDocumentsParty : null;
  if (!deal.initiatorUserId || (responsible !== "INITIATOR" && responsible !== "COUNTERPARTY")) return true;
  return responsible === "INITIATOR" ? userId === deal.initiatorUserId : userId !== deal.initiatorUserId;
}

export function canUploadRequirement(deal: DealPolicyInput, userId: string, requirement: Requirement): boolean {
  return isPersonalRequirement(requirement) || canUploadSubject(deal, userId);
}

export function requiredForParty(deal: DealPolicyInput, userId: string): string[] {
  return deal.templateVersion.documentRequirements.filter(requirement => requirement.required && canUploadRequirement(deal, userId, requirement)).map(item => item.id);
}
