import type { ScreenId } from "@/lib/types";

export const MAIN_FLOW: ScreenId[] = [
  "splash", "welcome", "consents", "phone", "dashboard-empty", "deal-type",
  "deal-description", "deal-parameters", "ai-questions", "ai-generation",
  "initiator-data", "counterparty-data", "invitation", "invitation-waiting",
  "counterparty-connected", "required-documents", "document-upload", "upload-success",
  "evidence-files", "verification-status", "warnings", "contract-preview", "contract-full",
  "terms-approval", "ready-to-sign", "pep-agreement", "otp", "signed-by-one-party",
  "completed", "deal-card",
];

export function getNextFlowScreen(id: ScreenId): ScreenId {
  const index = MAIN_FLOW.indexOf(id);
  return index >= 0 && index < MAIN_FLOW.length - 1 ? MAIN_FLOW[index + 1] : "deal-card";
}

export const EXTRA_LINKS: Partial<Record<ScreenId, ScreenId[]>> = {
  dashboard: ["deal-card", "profile"],
  "deal-card": ["deal-timeline", "deal-documents"],
  "deal-documents": ["pdf-viewer"],
  profile: ["saved-requisites", "settings"],
};
