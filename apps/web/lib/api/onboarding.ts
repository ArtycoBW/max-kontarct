import type {
  MaxContactRequest,
  OnboardingStateResponse,
  RecordConsentsRequest,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getOnboardingState(): Promise<OnboardingStateResponse> {
  return apiRequest<OnboardingStateResponse>("onboarding");
}

export function recordConsents(
  body: RecordConsentsRequest,
): Promise<OnboardingStateResponse> {
  return apiRequest<OnboardingStateResponse>("onboarding/consents", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function verifyMaxPhone(
  body: MaxContactRequest,
): Promise<OnboardingStateResponse> {
  return apiRequest<OnboardingStateResponse>("onboarding/phone/max", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export function verifyDevelopmentPhone(): Promise<OnboardingStateResponse> {
  return apiRequest<OnboardingStateResponse>("onboarding/phone/dev", {
    method: "POST",
  });
}
