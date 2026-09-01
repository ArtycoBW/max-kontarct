import type {
  DealDocumentsWorkspaceResponse,
  DealFileCategory,
  DealFileResponse,
} from "@max-contract/contracts";

import { ApiError, apiRequest } from "./client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export function getDealDocuments(dealId: string): Promise<DealDocumentsWorkspaceResponse> {
  return apiRequest(`deals/${encodeURIComponent(dealId)}/files`);
}

export function getDealFileDownloadUrl(dealId: string, fileId: string): string {
  return `${API_BASE_URL.replace(/\/$/, "")}/deals/${encodeURIComponent(dealId)}/files/${encodeURIComponent(fileId)}/content`;
}

export function uploadDealFile(
  dealId: string,
  file: File,
  input: { category: DealFileCategory; requirementId?: string },
  onProgress: (progress: number) => void,
): Promise<DealFileResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `${API_BASE_URL.replace(/\/$/, "")}/deals/${encodeURIComponent(dealId)}/files`,
    );
    request.withCredentials = true;
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new ApiError(0, {
      code: "NETWORK_ERROR",
      message: "Не удалось загрузить файл. Проверьте соединение.",
    }));
    request.onload = () => {
      const body = parseBody(request.responseText);
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(request.status, body));
        return;
      }
      onProgress(100);
      resolve(body as unknown as DealFileResponse);
    };
    const form = new FormData();
    form.append("category", input.category);
    if (input.requirementId) form.append("requirementId", input.requirementId);
    form.append("file", file);
    request.send(form);
  });
}

function parseBody(value: string): { code?: string; details?: unknown; message?: string } {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
