import { DealStatus, type Prisma } from "@prisma/client";
import { requiredForParty } from "./document-policy";

type ReadinessInput = Parameters<typeof requiredForParty>[0] & {
  parties: Array<{ userId: string; user?: { profile?: { birthDate?: unknown; firstName?: unknown; lastName?: unknown; passportDetails?: unknown } | null } | null }>;
  files: Array<{ ownerUserId: string; requirementId: string | null; reviewStatus: string }>;
};

/** Existing accepted documents remain valid when the agreement starts or a party joins. */
export function documentStage(deal: ReadinessInput): DealStatus {
  if (deal.parties.length !== 2) return DealStatus.DOCUMENTS_PENDING;
  const required = deal.parties.flatMap(party => requiredForParty(deal, party.userId)
    .map(requirementId => ({ ownerUserId: party.userId, requirementId })));
  const has = (item: typeof required[number], statuses: string[]) => deal.files.some(file =>
    file.ownerUserId === item.ownerUserId && file.requirementId === item.requirementId && statuses.includes(file.reviewStatus));
  if (required.every(item => has(item, ["ACCEPTED"]))) return DealStatus.TERMS_REVIEW;
  if (required.every(item => has(item, ["ACCEPTED", "PENDING"]))) return DealStatus.DOCUMENTS_REVIEW;
  return DealStatus.DOCUMENTS_PENDING;
}

/** Call under the deal row lock, after updating parties / the current version. */
export async function loadDocumentStage(transaction: Prisma.TransactionClient, dealId: string): Promise<DealStatus> {
  const deal = await transaction.deal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      initiatorUserId: true,
      parties: {
        select: {
          userId: true,
          user: { select: { profile: { select: { birthDate: true, firstName: true, lastName: true, passportDetails: true } } } },
        },
      },
      versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { terms: true } },
      templateVersion: { select: { documentRequirements: { select: { id: true, key: true, title: true, required: true } } } },
      files: { where: { category: "REQUIREMENT" }, select: { ownerUserId: true, requirementId: true, reviewStatus: true } },
    },
  });
  return documentStage(deal);
}
