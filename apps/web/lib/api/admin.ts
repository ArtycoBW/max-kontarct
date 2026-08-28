import type {
  AdminAuditListResponse,
  AdminUserListResponse,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getAdminUsers(): Promise<AdminUserListResponse> {
  return apiRequest<AdminUserListResponse>("admin/users");
}

export function getAdminAuditEvents(): Promise<AdminAuditListResponse> {
  return apiRequest<AdminAuditListResponse>("admin/audit");
}
