import { runUploadQueue } from "./upload-queue";

describe("upload queue", () => {
  it("uploads sequentially and retries only failed items without duplicating successful files", async () => {
    let active = 0;
    const upload = jest.fn(async (item: string) => {
      expect(active++).toBe(0);
      await Promise.resolve();
      active--;
      if (item === "bad") throw Error("Неверный формат");
    });
    const result = await runUploadQueue(["first", "bad", "last"], upload, new AbortController().signal);
    expect(result).toEqual({ succeeded: ["first", "last"], failed: [{ item: "bad", message: "Неверный формат" }] });
    const retry = jest.fn(async () => undefined);
    await runUploadQueue(result.failed.map(({ item }) => item), retry, new AbortController().signal);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith("bad", 0);
  });
  it("does not start remaining files when leaving the screen", async () => {
    const controller = new AbortController();
    const upload = jest.fn(async () => { controller.abort(); });
    await runUploadQueue([1, 2, 3], upload, controller.signal);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
