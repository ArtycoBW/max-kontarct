import type {
  ContractTemplateDetailsResponse,
  ContractTemplateListResponse,
  ValidateTemplateAnswersRequest,
  ValidateTemplateAnswersResponse,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getTemplates(): Promise<ContractTemplateListResponse> {
  return apiRequest<ContractTemplateListResponse>("templates");
}

export function getTemplate(
  slug: string,
): Promise<ContractTemplateDetailsResponse> {
  return apiRequest<ContractTemplateDetailsResponse>(
    `templates/${encodeURIComponent(slug)}`,
  );
}

export function validateTemplateAnswers(
  slug: string,
  request: ValidateTemplateAnswersRequest,
): Promise<ValidateTemplateAnswersResponse> {
  return apiRequest<ValidateTemplateAnswersResponse>(
    `templates/${encodeURIComponent(slug)}/validate`,
    {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}
