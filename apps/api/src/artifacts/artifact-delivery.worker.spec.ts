import { createHash } from "node:crypto";
import { ArtifactDeliveryWorker } from "./artifact-delivery.worker";
import type { PrismaService } from "../database/prisma.service";
import type { MaxBotService } from "../max-bot/max-bot.service";
import type { StorageService } from "../storage/storage.service";

describe("artifact delivery outbox", () => {
  const body = Buffer.from("signed test document");
  const job = { id: "job", userId: "user", attempts: 0, uploadToken: null, user: { maxAccount: { maxUserId: "123" } },
    artifact: { dealId: "deal", objectKey: "private/pdf", sha256: createHash("sha256").update(body).digest("hex"), originalName: "Договор.pdf", mimeType: "application/pdf", type: "FINAL_PDF" } };
  function setup(overrides = {}) {
    const prisma = { artifactDelivery: { findFirst: jest.fn().mockResolvedValue({ ...job, ...overrides }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, dealParty: { findFirst: jest.fn().mockResolvedValue({ id: "party" }) } };
    const max = { canSendDocuments: jest.fn().mockResolvedValue(true), uploadDocument: jest.fn().mockResolvedValue("uploaded-token"), sendDocument: jest.fn().mockResolvedValue(undefined) };
    const storage = { getObject: jest.fn().mockResolvedValue({ body }) };
    const worker = new ArtifactDeliveryWorker(prisma as unknown as PrismaService, max as unknown as MaxBotService, storage as unknown as StorageService);
    return { prisma, max, storage, worker };
  }
  it("uploads private verified bytes and sends only to the deal participant", async () => {
    const { worker, max, prisma } = setup();
    await worker.tick();
    expect(max.uploadDocument).toHaveBeenCalledWith(body, "application/pdf", "Договор.pdf");
    expect(max.sendDocument).toHaveBeenCalledWith("123", "uploaded-token", expect.any(String));
    expect(prisma.artifactDelivery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT", uploadToken: null }) as unknown }));
  });
  it("reuses stored token after transient delivery errors", async () => {
    const { worker, max, prisma } = setup({ uploadToken: "existing" });
    max.sendDocument.mockRejectedValue(new Error("not ready"));
    await worker.tick();
    expect(max.uploadDocument).not.toHaveBeenCalled();
    expect(max.sendDocument).toHaveBeenCalledWith("123", "existing", expect.any(String));
    expect(prisma.artifactDelivery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", leaseUntil: null, nextAttemptAt: expect.any(Date) as unknown }) as unknown }));
  });
  it("does not send without notification consent", async () => {
    const { worker, max, prisma } = setup();
    max.canSendDocuments.mockResolvedValue(false);
    await worker.tick();
    expect(max.uploadDocument).not.toHaveBeenCalled();
    expect(prisma.artifactDelivery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) as unknown }));
  });
  it("does not send when another worker owns the lease", async () => {
    const { worker, max, prisma } = setup();
    prisma.artifactDelivery.updateMany.mockResolvedValue({ count: 0 });
    await worker.tick();
    expect(max.sendDocument).not.toHaveBeenCalled();
  });
  it("does not upload altered bytes", async () => {
    const { worker, max, storage } = setup();
    storage.getObject.mockResolvedValue({ body: Buffer.from("altered") });
    await worker.tick();
    expect(max.uploadDocument).not.toHaveBeenCalled();
  });
});
