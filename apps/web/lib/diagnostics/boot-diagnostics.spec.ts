import { runInNewContext } from "node:vm";
import { BOOT_EXPIRES_AT, BOOT_PARAMETER, BOOT_PATH, BOOT_PROBE, isBootProbe, parseBootEvent, type BootEvent } from "./boot-schema";
import { createBootScript } from "./boot-script";
import { createBootRecorder, handleBootReport } from "./boot-server";
import { reportBootStage } from "./boot-client";

const run = "0123456789abcdef";
const valid: BootEvent = { probe: BOOT_PROBE, run, stage: "document-start", detail: "none", elapsedMs: 100, context: "embedded" };

describe("opt-in boot diagnostics privacy", () => {
  it("only enables the exact probe before its expiry", () => {
    expect(isBootProbe(BOOT_PARAMETER, BOOT_EXPIRES_AT - 1)).toBe(true);
    expect(isBootProbe(BOOT_PARAMETER, BOOT_EXPIRES_AT)).toBe(false);
    for (const value of [undefined, "", "true", "bootdiag_any", [BOOT_PARAMETER]]) expect(isBootProbe(value)).toBe(false);
  });

  it("accepts only a freshly constructed bounded event", () => {
    expect(parseBootEvent(valid)).toEqual(valid);
    expect(parseBootEvent(valid)).not.toBe(valid);
  });

  it.each([
    { ...valid, token: "must-not-log" }, { ...valid, url: "https://example.test/#secret" },
    { ...valid, message: "passport-data" }, { ...valid, userId: 123 },
    { ...valid, stage: "raw-secret" }, { ...valid, detail: "raw-secret" },
    { ...valid, probe: "unknown" }, { ...valid, run: "phone-number" },
    { ...valid, elapsedMs: -1 }, { ...valid, elapsedMs: 30_001 },
    { ...valid, elapsedMs: 1.5 }, { ...valid, context: "full-user-agent" },
    { ...valid, stage: "document-request", context: "server" }, null, [], "secret",
  ])("rejects unsafe/unexpected event %#", (input) => expect(parseBootEvent(input)).toBeNull());

  it("bounds and deduplicates server logs and expires automatically", () => {
    let now = BOOT_EXPIRES_AT - 60_000;
    const log = jest.fn();
    const record = createBootRecorder(log, () => now);
    expect(record(valid)).toBe(true);
    expect(record(valid)).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    for (let index = 1; index < 128; index++) expect(record({ ...valid, run: index.toString(16).padStart(16, "0") })).toBe(true);
    expect(record({ ...valid, run: "ffffffffffffffff" })).toBe(false);
    now = BOOT_EXPIRES_AT;
    expect(record({ ...valid, stage: "dom-ready" })).toBe(false);
  });

  it("creates safe parser-executed code independent of React or MAX", async () => {
    const requests: Array<{ url: string; options: RequestInit }> = [];
    const handlers: Record<string, (event?: unknown) => void> = {};
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const browser: Record<string, unknown> = {
      parent: {},
      addEventListener: (type: string, callback: (event?: unknown) => void) => { handlers[type] = callback; },
      removeEventListener: jest.fn(),
    };
    runInNewContext(createBootScript(run), {
      window: browser,
      document: { readyState: "loading", addEventListener: jest.fn(), removeEventListener: jest.fn() },
      Date,
      fetch: (url: string, options: RequestInit) => { requests.push({ url, options }); return Promise.resolve(); },
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
    });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!.options.body as string)).toMatchObject({ stage: "document-start", run, context: "embedded" });
    handlers.error!({ target: browser, error: { name: "TypeError", message: "PRIVATE passport and MAX token", stack: "PRIVATE_URL" } });
    handlers.unhandledrejection!({ reason: { name: "SecurityError", token: "PRIVATE_TOKEN" } });
    const reporter = browser.__maxBootDiagnostic as { report: (stage: string, detail?: string) => void };
    reporter.report("PRIVATE_STAGE");
    reporter.report("sdk-error", "PRIVATE_DETAIL");
    reporter.report("document-start");
    expect(requests).toHaveLength(3);
    expect(JSON.stringify(requests)).not.toContain("PRIVATE");
    for (const request of requests) {
      expect(request.url).toBe(BOOT_PATH);
      expect(request.options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", keepalive: true });
      expect(parseBootEvent(JSON.parse(request.options.body as string))).not.toBeNull();
    }
    timers.find(timer => timer.ms === 25_000)!.fn();
    const count = requests.length;
    reporter.report("sdk-ready");
    expect(requests).toHaveLength(count);
    expect(() => createBootScript('</script>')).toThrow();
  });

  it("is inert without opt-in and never propagates reporter failures", () => {
    expect(() => reportBootStage("react-mounted")).not.toThrow();
    Object.defineProperty(global, "window", { configurable: true, value: { __maxBootDiagnostic: { report() { throw new Error("diagnostic unavailable"); } } } });
    expect(() => reportBootStage("react-mounted")).not.toThrow();
    Reflect.deleteProperty(global, "window");
  });
});

describe("boot report endpoint", () => {
  let log: jest.SpyInstance;
  const savedOrigin = process.env.PUBLIC_WEB_URL;
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(BOOT_EXPIRES_AT - 60_000);
    process.env.PUBLIC_WEB_URL = "https://www.max-kontrakt.ru";
    log = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (savedOrigin === undefined) delete process.env.PUBLIC_WEB_URL; else process.env.PUBLIC_WEB_URL = savedOrigin;
  });
  function request(body: string, origin = "https://www.max-kontrakt.ru") {
    return new Request(`https://www.max-kontrakt.ru${BOOT_PATH}`, { method: "POST", headers: { origin, "content-type": "text/plain", cookie: "PRIVATE_COOKIE", referer: "https://example.test/?PRIVATE_TOKEN" }, body });
  }
  it("logs only sanitized stages, never headers or request URLs", async () => {
    const response = await handleBootReport(request(JSON.stringify({ ...valid, run: "1111111111111111" })));
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
  });
  it("rejects unknown fields, oversized bodies, malformed JSON and cross-origin calls without logging", async () => {
    expect((await handleBootReport(request(JSON.stringify({ ...valid, token: "PRIVATE" })))).status).toBe(400);
    expect((await handleBootReport(request("x".repeat(769)))).status).toBe(413);
    expect((await handleBootReport(request("not-json"))).status).toBe(400);
    expect((await handleBootReport(request(JSON.stringify(valid), "https://outside.test"))).status).toBe(403);
    expect(log).not.toHaveBeenCalled();
  });
  it("stops collection after expiry", async () => {
    jest.spyOn(Date, "now").mockReturnValue(BOOT_EXPIRES_AT);
    expect((await handleBootReport(request(JSON.stringify(valid)))).status).toBe(404);
    expect(log).not.toHaveBeenCalled();
  });
});
