import type { ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, Subject, throwError } from "rxjs";
import { FileUploadCapacityInterceptor } from "./upload-capacity.interceptor";

describe("multipart memory capacity", () => {
  it("rejects a third upload before reading its body and releases canceled slots", async () => {
    const limiter = new FileUploadCapacityInterceptor();
    const context = {} as ExecutionContext;
    const first = limiter.intercept(context, { handle: () => new Subject() }).subscribe();
    const second = limiter.intercept(context, { handle: () => new Subject() }).subscribe();
    const handle = jest.fn(() => of(true));
    await expect(firstValueFrom(limiter.intercept(context, { handle }))).rejects.toMatchObject({ status: 429 });
    expect(handle).not.toHaveBeenCalled();
    first.unsubscribe();
    await expect(firstValueFrom(limiter.intercept(context, { handle }))).resolves.toBe(true);
    second.unsubscribe();
    await expect(firstValueFrom(limiter.intercept(context, { handle: () => throwError(() => Error("invalid file")) }))).rejects.toThrow("invalid file");
    await expect(firstValueFrom(limiter.intercept(context, { handle }))).resolves.toBe(true);
  });
});
