import { getMaxInitData, waitForMaxWebApp } from "./bridge";

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
});
