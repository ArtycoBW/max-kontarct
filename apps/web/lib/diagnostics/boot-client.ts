import type { BootDetail, BootStage } from "./boot-schema";

declare global {
  interface Window {
    __maxBootDiagnostic?: { report: (stage: BootStage, detail?: BootDetail) => void };
  }
}

export function reportBootStage(stage: BootStage, detail: BootDetail = "none"): void {
  try {
    if (typeof window !== "undefined") window.__maxBootDiagnostic?.report(stage, detail);
  } catch {
    // Diagnostics must never affect the normal application or its error handling.
  }
}
