import type { DealStatus } from "@max-contract/contracts";

import { ACTIVE_DEAL_REFRESH_MS, dealRefreshInterval } from "./deal-refresh";

describe("active deal synchronization", () => {
  it.each<DealStatus>(["INVITED", "COUNTERPARTY_JOINED", "DOCUMENTS_PENDING", "DOCUMENTS_REVIEW", "TERMS_REVIEW", "READY_TO_SIGN", "SIGNED_BY_ONE", "SIGNED"])("refreshes %s without reopening the screen", (status) => {
    expect(dealRefreshInterval(status)).toBe(ACTIVE_DEAL_REFRESH_MS);
  });
  it.each<DealStatus>(["COMPLETED", "CANCELED"])("stops polling terminal status %s", (status) => {
    expect(dealRefreshInterval(status)).toBe(false);
  });
});
