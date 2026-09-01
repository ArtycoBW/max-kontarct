import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

export interface FrozenDealParty {
  maxUserIdRef: string | null;
  partyId: string;
  profile: {
    address: string | null;
    birthDate: string | null;
    email: string | null;
    firstName: string;
    lastName: string;
    middleName: string | null;
  };
  role: "INITIATOR" | "COUNTERPARTY";
  userId: string;
  verifiedPhoneRef: string;
}

export interface FrozenDealSnapshot {
  contract: {
    draft: Prisma.JsonValue;
    number: string;
  };
  deal: {
    id: string;
    templateSlug: string;
    templateTitle: string;
    templateVersion: number;
    title: string;
    versionId: string;
    versionNumber: number;
  };
  frozenAt: string;
  parties: FrozenDealParty[];
  schemaVersion: "deal-signature-v1";
  terms: Prisma.JsonValue;
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

export function hashFrozenSnapshot(snapshot: FrozenDealSnapshot): string {
  return createHash("sha256").update(canonicalSerialize(snapshot)).digest("hex");
}

export function createContractNumber(
  dealId: string,
  versionNumber: number,
  frozenAt: Date,
): string {
  const date = frozenAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `МК-${date}-${dealId.slice(0, 8).toUpperCase()}-V${versionNumber}`;
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => [key, sortCanonical(item)]),
  );
}
