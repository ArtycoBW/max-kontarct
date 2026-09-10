import { BOOT_EXPIRES_AT, BOOT_PROBE, parseBootEvent, type BootEvent } from "./boot-schema";

type ServerBootEvent = Omit<BootEvent, "stage" | "context"> & { stage: "document-request"; context: "server" };

// Bounded, process-local anti-spam budget; no DB, Redis, cookies, or user identifiers.
export function createBootRecorder(log: (event: BootEvent | ServerBootEvent) => void, clock = () => Date.now()) {
  const runs = new Map<string, Set<string>>();
  let total = 0;
  let minute = -1;
  let minuteCount = 0;
  return (event: BootEvent | ServerBootEvent): boolean => {
    const now = clock();
    if (now >= BOOT_EXPIRES_AT || total >= 1024) return false;
    const currentMinute = Math.floor(now / 60_000);
    if (currentMinute !== minute) { minute = currentMinute; minuteCount = 0; }
    const seen = runs.get(event.run);
    const key = `${event.stage}:${event.detail}`;
    if (seen?.has(key)) return true;
    if (minuteCount >= 128 || (!seen && runs.size >= 128) || (seen && seen.size >= 48)) return false;
    const run = seen ?? new Set<string>();
    run.add(key); runs.set(event.run, run); total++; minuteCount++;
    log(event);
    return true;
  };
}

const record = createBootRecorder(event => console.info("[boot-diagnostic]", JSON.stringify(event)));

export function recordBootDocument(run: string): void {
  if (!/^[a-f0-9]{16}$/.test(run)) return;
  try { record({ probe: BOOT_PROBE, run, stage: "document-request", detail: "none", elapsedMs: 0, context: "server" }); } catch { /* Best effort only. */ }
}

function reply(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function handleBootReport(request: Request): Promise<Response> {
  if (Date.now() >= BOOT_EXPIRES_AT) return reply(404);
  const origin = new URL(process.env.PUBLIC_WEB_URL || request.url).origin;
  if (request.headers.get("origin") !== origin) return reply(403);
  if (!/^(text\/plain|application\/json)(;|$)/i.test(request.headers.get("content-type") ?? "")) return reply(415);
  const reader = request.body?.getReader();
  if (!reader) return reply(400);
  const timeout = setTimeout(() => { void reader.cancel().catch(() => undefined); }, 2_000);
  try {
    let bytes = 0;
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 768) { await reader.cancel(); return reply(413); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const event = parseBootEvent(JSON.parse(text));
    if (!event) return reply(400);
    return reply(record(event) ? 204 : 429);
  } catch {
    return reply(400);
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}
