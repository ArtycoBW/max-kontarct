import { getMaxInitData, getMaxStartPayload, notifyMaxWebAppReady, waitForMaxWebApp } from "./bridge";

function setWindow(value: Partial<Window>): void {
  Object.defineProperty(global, "window", {
    configurable: true,
    value: {
      setTimeout: global.setTimeout as unknown as typeof window.setTimeout,
      ...value,
    },
    writable: true,
  });
}

describe("MAX Bridge startup", () => {
  it("enables the native close confirmation once when the SDK is ready", () => {
    const enableClosingConfirmation = jest.fn();
    setWindow({ WebApp: { initData: "", ready: jest.fn(), enableClosingConfirmation } });
    expect(notifyMaxWebAppReady()).toBe(true);
    expect(notifyMaxWebAppReady()).toBe(true);
    expect(enableClosingConfirmation).toHaveBeenCalledTimes(1);
  });

  it("keeps startup working when close confirmation is unsupported", () => {
    setWindow({ WebApp: { initData: "", ready: jest.fn(), enableClosingConfirmation: () => { throw new Error("unsupported"); } } });
    expect(notifyMaxWebAppReady()).toBe(true);
  });
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Reflect.deleteProperty(global, "window");
  });

  it("uses an already loaded bridge without reinitializing it", async () => {
    const ready = jest.fn();
    setWindow({ WebApp: { initData: "signed-init-data", ready } });

    await expect(waitForMaxWebApp()).resolves.toMatchObject({
      initData: "signed-init-data",
    });
    expect(ready).not.toHaveBeenCalled();
    expect(getMaxInitData()).toBe("signed-init-data");
  });

  it("waits until the external bridge script has initialized WebApp", async () => {
    const ready = jest.fn();
    setWindow({});
    const bridge = waitForMaxWebApp(500);

    window.setTimeout(() => {
      window.WebApp = { initData: "delayed-init-data", ready };
    }, 50);
    await jest.advanceTimersByTimeAsync(75);

    await expect(bridge).resolves.toMatchObject({
      initData: "delayed-init-data",
    });
    expect(ready).not.toHaveBeenCalled();
  });

  it("fails with a clear error when MAX Bridge never loads", async () => {
    setWindow({});
    const bridge = waitForMaxWebApp(100);

    const rejection = expect(bridge).rejects.toThrow(
      "Откройте приложение внутри MAX и повторите попытку",
    );
    await jest.advanceTimersByTimeAsync(125);
    await rejection;
  });

  it("announces UI readiness once per bridge, independently of authentication", () => {
    const ready = jest.fn(function (this: MaxWebApp) {
      expect(this).toBe(window.WebApp);
    });
    setWindow({ WebApp: { initData: "", ready } });

    expect(notifyMaxWebAppReady()).toBe(true);
    expect(notifyMaxWebAppReady()).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("can announce readiness when the SDK loads after the initial UI", () => {
    setWindow({});
    expect(notifyMaxWebAppReady()).toBe(false);
    const ready = jest.fn();
    window.WebApp = { initData: "", ready };

    expect(notifyMaxWebAppReady()).toBe(true);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("announces readiness again for a replaced bridge instance", () => {
    const ready = jest.fn();
    setWindow({ WebApp: { initData: "", ready } });
    notifyMaxWebAppReady();
    window.WebApp = { initData: "", ready };
    notifyMaxWebAppReady();

    expect(ready).toHaveBeenCalledTimes(2);
  });

  it("does not crash outside the browser or without ready support", () => {
    expect(notifyMaxWebAppReady()).toBe(false);
    setWindow({ WebApp: { initData: "" } });
    expect(notifyMaxWebAppReady()).toBe(false);
  });

  it("isolates host errors and allows a later readiness attempt", () => {
    const ready = jest.fn().mockImplementationOnce(() => {
      throw new Error("host unavailable");
    });
    setWindow({ WebApp: { initData: "", ready } });

    expect(notifyMaxWebAppReady()).toBe(false);
    expect(notifyMaxWebAppReady()).toBe(true);
    expect(notifyMaxWebAppReady()).toBe(true);
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it("parses a reviewed invitation as a UI hint, retaining its secret for server validation", () => {
    Object.defineProperty(global, "window", { configurable: true, value: { WebApp: { initDataUnsafe: { start_param: "invite_AbCdEfGhIjKl_0123456789abcdefghijklmnopqrstuv_reviewed" } } } });
    expect(getMaxStartPayload()).toEqual({ kind: "invitation", publicCode: "AbCdEfGhIjKl", token: "0123456789abcdefghijklmnopqrstuv", previewSeen: true });
  });

  it("parses an opaque invitation payload without exposing personal data", () => {
    setWindow({
      WebApp: {
        initData: "signed-init-data",
        initDataUnsafe: {
          start_param:
            "invite_AbCdEfGhIjKl_0123456789abcdefghijklmnopqrstuv",
        },
      },
    });

    expect(getMaxStartPayload()).toEqual({
      kind: "invitation",
      publicCode: "AbCdEfGhIjKl",
      token: "0123456789abcdefghijklmnopqrstuv",
    });
  });

  it("rejects malformed start parameters", () => {
    setWindow({
      WebApp: {
        initData: "signed-init-data",
        initDataUnsafe: { start_param: "invite_Артур_+79990000000" },
      },
    });

    expect(getMaxStartPayload()).toBeNull();
  });
});
