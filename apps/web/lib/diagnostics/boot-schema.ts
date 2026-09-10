// Temporary, opt-in launch probe. This is not an authentication credential.
export const BOOT_PROBE = "dbd82052ee4e7d36935dccf2";
export const BOOT_PARAMETER = `bootdiag_${BOOT_PROBE}`;
export const BOOT_EXPIRES_AT = Date.parse("2026-09-13T15:00:00Z");
export const BOOT_PATH = "/boot-diagnostics";

export const bootStages = [
  "document-start", "dom-ready", "page-load", "react-mounted",
  "sdk-loaded", "sdk-ready", "sdk-error", "app-script-loaded",
  "bridge-found", "bridge-timeout", "ready-called", "ready-error",
  "auth-start", "auth-success", "auth-error", "resource-error",
  "js-error", "promise-error", "wait-5s", "wait-12s", "wait-18s",
  "capture-end", "pagehide",
] as const;
export type BootStage = typeof bootStages[number];
export const bootDetails = [
  "none", "sdk", "app-script", "style", "image", "other-resource",
  "TypeError", "SyntaxError", "SecurityError", "ReferenceError", "RangeError", "OtherError",
  "unauthorized", "forbidden", "rate-limited", "server-error", "timeout", "network", "other",
] as const;
export type BootDetail = typeof bootDetails[number];
export interface BootEvent {
  probe: string;
  run: string;
  stage: BootStage;
  detail: BootDetail;
  elapsedMs: number;
  context: "embedded" | "standalone";
}

export function isBootProbe(value: unknown, now = Date.now()): boolean {
  return value === BOOT_PARAMETER && now < BOOT_EXPIRES_AT;
}

export function parseBootEvent(value: unknown): BootEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ["probe", "run", "stage", "detail", "elapsedMs", "context"];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) return null;
  if (row.probe !== BOOT_PROBE || typeof row.run !== "string" || !/^[a-f0-9]{16}$/.test(row.run)) return null;
  if (!bootStages.includes(row.stage as BootStage) || !bootDetails.includes(row.detail as BootDetail)) return null;
  if (!Number.isInteger(row.elapsedMs) || (row.elapsedMs as number) < 0 || (row.elapsedMs as number) > 30_000) return null;
  if (row.context !== "embedded" && row.context !== "standalone") return null;
  // Construct a fresh object: never log the request, headers, or unvalidated input.
  return { probe: BOOT_PROBE, run: row.run, stage: row.stage as BootStage, detail: row.detail as BootDetail, elapsedMs: row.elapsedMs as number, context: row.context };
}
