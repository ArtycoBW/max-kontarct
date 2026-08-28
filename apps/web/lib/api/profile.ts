import type {
  UpdateUserProfileRequest,
  UserProfileResponse,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getProfile(): Promise<UserProfileResponse> {
  return apiRequest<UserProfileResponse>("profile");
}

export function updateProfile(
  body: UpdateUserProfileRequest,
): Promise<UserProfileResponse> {
  return apiRequest<UserProfileResponse>("profile", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}
