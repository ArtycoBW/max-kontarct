import { apiRequest } from "./client";

export interface DependencyCheck {
  status: "up" | "down";
}

export interface ReadinessResponse {
  checks: Record<string, DependencyCheck>;
  status: "ok";
  timestamp: string;
}

export function getReadiness(): Promise<ReadinessResponse> {
  return apiRequest<ReadinessResponse>("health/ready");
}
