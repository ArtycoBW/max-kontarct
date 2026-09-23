type Requirement = { id: string; required: boolean; key?: string; title?: string };
type PassportProfile = {
  birthDate?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  passportDetails?: unknown;
};
type DealPolicyInput = {
  initiatorUserId?: string;
  parties?: Array<{ userId: string; user?: { profile?: PassportProfile | null } | null }>;
  versions?: Array<{ terms?: unknown }>;
  templateVersion: { documentRequirements: Requirement[] };
};

export function isPersonalRequirement(requirement: { key?: string; title?: string } | null) {
  return requirement !== null && /(passport|identity|personal|удостовер|паспорт)/iu.test(`${requirement.key ?? ""} ${requirement.title ?? ""}`);
}

export function isIdentityRequirement(requirement: { key?: string; title?: string } | null) {
  return requirement !== null && /(passport|identity|удостовер|паспорт)/iu.test(`${requirement.key ?? ""} ${requirement.title ?? ""}`);
}

/** A complete profile passport record replaces the need to upload a passport scan. */
export function hasCompletePassportProfile(profile: PassportProfile | null | undefined): boolean {
  if (!profile || typeof profile.passportDetails !== "object" || profile.passportDetails === null || Array.isArray(profile.passportDetails)) return false;
  const passport = profile.passportDetails as Record<string, unknown>;
  const digits = (value: unknown) => typeof value === "string" ? value.replace(/\D/gu, "") : "";
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const hasBirthDate = profile.birthDate instanceof Date
    ? !Number.isNaN(profile.birthDate.getTime())
    : text(profile.birthDate);
  return text(profile.firstName) && text(profile.lastName) && hasBirthDate &&
    digits(passport.series).length === 4 && digits(passport.number).length === 6 &&
    text(passport.issuedAt) && text(passport.issuer) && digits(passport.divisionCode).length === 6 &&
    text(passport.birthPlace) && (passport.gender === "М" || passport.gender === "Ж");
}

export function passportProfileSatisfiesRequirement(deal: DealPolicyInput, userId: string, requirement: Requirement): boolean {
  if (!isIdentityRequirement(requirement)) return false;
  const profile = deal.parties?.find(party => party.userId === userId)?.user?.profile;
  return hasCompletePassportProfile(profile);
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
  return deal.templateVersion.documentRequirements
    .filter(requirement => requirement.required && canUploadRequirement(deal, userId, requirement))
    .filter(requirement => !passportProfileSatisfiesRequirement(deal, userId, requirement))
    .map(item => item.id);
}
