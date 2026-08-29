import type {
  AiClarificationSessionResponse,
  AnswerAiClarificationRequest,
  ContractTemplateDetailsResponse,
  ContractTemplateListResponse,
  StartAiClarificationRequest,
  ValidateTemplateAnswersRequest,
  ValidateTemplateAnswersResponse,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getTemplates(): Promise<ContractTemplateListResponse> {
  return apiRequest<ContractTemplateListResponse>("templates");
}

export function startAiClarification(
  slug: string,
  request: StartAiClarificationRequest,
): Promise<AiClarificationSessionResponse> {
  return apiRequest<AiClarificationSessionResponse>(
    `templates/${encodeURIComponent(slug)}/clarifications`,
    {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      timeoutMs: 30_000,
    },
  );
}

export function answerAiClarification(
  slug: string,
  sessionId: string,
  request: AnswerAiClarificationRequest,
): Promise<AiClarificationSessionResponse> {
  return apiRequest<AiClarificationSessionResponse>(
    `templates/${encodeURIComponent(slug)}/clarifications/${encodeURIComponent(sessionId)}/answers`,
    {
      body: JSON.stringify(request),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      timeoutMs: 30_000,
    },
  );
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
