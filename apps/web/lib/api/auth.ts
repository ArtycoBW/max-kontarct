import type {
  AuthSessionResponse,
  MaxAuthRequest,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getCurrentSession(): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("auth/me");
}

export function authenticateWithMax(
  initData: string,
): Promise<AuthSessionResponse> {
  const body: MaxAuthRequest = { initData };
  return apiRequest<AuthSessionResponse>("auth/max", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function authenticateDevelopment(): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>("auth/dev", { method: "POST" });
}

export function logout(): Promise<void> {
  return apiRequest<void>("auth/logout", { method: "POST" });
}
