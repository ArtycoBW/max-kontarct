import { createHash, randomUUID } from "node:crypto";

export function calculateSha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export function createPrivateObjectKey(dealId: string): string {
  return `private/deals/${dealId}/${randomUUID()}`;
}
