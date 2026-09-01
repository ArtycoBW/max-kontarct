import type { UserTrustStatusResponse } from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getTrustStatus(): Promise<UserTrustStatusResponse> {
  return apiRequest("trust/status");
}
