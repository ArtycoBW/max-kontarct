import type { DealStatus } from "@max-contract/contracts";

export const ACTIVE_DEAL_REFRESH_MS = 3_000;

export function dealRefreshInterval(status: DealStatus | undefined): number | false {
  return status === "COMPLETED" || status === "CANCELED" ? false : ACTIVE_DEAL_REFRESH_MS;
}
