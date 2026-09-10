import type { CaptureQuality } from "./image-quality";

export type CaptureHint = "checking" | "dark" | "glare" | "moving" | "soft" | "good";
export const captureHint = (q: CaptureQuality | null): CaptureHint => !q ? "checking" : q.dark ? "dark" : q.glare ? "glare" : q.moving ? "moving" : q.soft ? "soft" : "good";

/** One prioritized instruction, only after it persists; retain it long enough to read.
 * This is presentation only. Motion/quality guards and capture still use raw evidence. */
export function createHintStabilizer() {
  let shown: CaptureHint = "checking", candidate: CaptureHint = "checking", since = 0, changed = -Infinity;
  return (quality: CaptureQuality | null, now: number): CaptureHint => {
    const next = captureHint(quality);
    if (next !== candidate) { candidate = next; since = now; }
    if (candidate !== shown && now - since >= 1200 && now - changed >= 2400) { shown = candidate; changed = now; }
    return shown;
  };
}
