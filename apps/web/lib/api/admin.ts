import type {
  AdminAiGenerationListResponse,
  AdminAuditListResponse,
  AdminTemplateListResponse,
  AdminTemplateVersion,
  AdminUserListResponse,
  UpdateAdminTemplateVersionRequest,
} from "@max-contract/contracts";

import { apiRequest } from "./client";

export function getAdminUsers(): Promise<AdminUserListResponse> {
  return apiRequest<AdminUserListResponse>("admin/users");
}

export function getAdminAuditEvents(): Promise<AdminAuditListResponse> {
  return apiRequest<AdminAuditListResponse>("admin/audit");
}

export function getAdminTemplates(): Promise<AdminTemplateListResponse> {
  return apiRequest<AdminTemplateListResponse>("admin/templates");
}

export function createAdminTemplateDraft(
  templateId: string,
): Promise<AdminTemplateVersion> {
  return apiRequest<AdminTemplateVersion>(
    `admin/templates/${templateId}/versions`,
    { method: "POST" },
  );
}

export function updateAdminTemplateDraft(
  templateId: string,
  versionId: string,
  input: UpdateAdminTemplateVersionRequest,
): Promise<AdminTemplateVersion> {
  return apiRequest<AdminTemplateVersion>(
    `admin/templates/${templateId}/versions/${versionId}`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
}

export function publishAdminTemplateDraft(
  templateId: string,
  versionId: string,
): Promise<AdminTemplateVersion> {
  return apiRequest<AdminTemplateVersion>(
    `admin/templates/${templateId}/versions/${versionId}/publish`,
    { method: "POST" },
  );
}

export function archiveAdminTemplateDraft(
  templateId: string,
  versionId: string,
): Promise<AdminTemplateVersion> {
  return apiRequest<AdminTemplateVersion>(
    `admin/templates/${templateId}/versions/${versionId}/archive`,
    { method: "POST" },
  );
}

export function getAdminAiGenerations(): Promise<AdminAiGenerationListResponse> {
  return apiRequest<AdminAiGenerationListResponse>("admin/ai-generations");
}
