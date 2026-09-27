import { ConfigService } from "@nestjs/config";
import { NativeDownloadsService } from "./native-downloads.module";

const path = "/api/v1/deals/20000000-0000-4000-8000-000000000001/files/30000000-0000-4000-8000-000000000001/content";
function setup() {
  const file = { id: "file1", originalName: "Тест.pdf", objectKey: "private/file1", mimeType: "application/pdf" };
  const prisma = { dealFile: { findFirst: jest.fn().mockResolvedValue(file) }, dealArtifact: { findFirst: jest.fn().mockResolvedValue(file) }, userSession: { findFirst: jest.fn().mockResolvedValue({ id: "session1" }) } };
  const cache = new Map<string, string>();
  const redis = { get: jest.fn((key: string) => Promise.resolve(cache.get(key) ?? null)), setWithExpiry: jest.fn((key: string, data: string) => { cache.set(key, data); return Promise.resolve(); }) };
  const storage = { getObject: jest.fn().mockResolvedValue({ body: Buffer.from("pdf"), contentType: "application/pdf" }) };
  const service = new NativeDownloadsService(prisma as never, redis as never, new ConfigService({ PUBLIC_WEB_URL: "https://example.test" }), storage as never);
  return { service, prisma, redis, storage, cache };
}

describe("native download capabilities", () => {
  it("issues a short-lived resource-scoped link and rechecks session/private ACL before download", async () => {
    const { service, prisma, redis, storage } = setup();
    const prepared = await service.prepare("user1", "session1", path);
    const token = new URL(prepared.url).searchParams.get("ticket")!;
    expect(token).toHaveLength(43);
    expect(redis.setWithExpiry).toHaveBeenCalledWith(expect.stringMatching(/^native-download:[a-f0-9]{64}$/), JSON.stringify({ userId: "user1", sessionId: "session1", kind: "file", id: "file1" }), 120);
    await service.redeem(token);
    expect(prisma.dealFile.findFirst).toHaveBeenLastCalledWith({ where: { id: "file1", deal: { parties: { some: { userId: "user1" } } }, OR: [{ ownerUserId: "user1" }, { visibility: "DEAL_PARTICIPANTS" }] } });
    expect(storage.getObject).toHaveBeenCalledWith("private/file1");
  });
  it("does not grant a missing or foreign private file", async () => {
    const { service, prisma, redis } = setup();
    prisma.dealFile.findFirst.mockResolvedValue(null);
    await expect(service.prepare("stranger", "s", path)).rejects.toThrow();
    expect(redis.setWithExpiry).not.toHaveBeenCalled();
  });
  it.each(["expired", "revoked", "removed"])("rejects %s grants", async reason => {
    const { service, cache, prisma, storage } = setup();
    const prepared = await service.prepare("user1", "session1", path);
    const token = new URL(prepared.url).searchParams.get("ticket")!;
    if (reason === "expired") cache.clear();
    if (reason === "revoked") prisma.userSession.findFirst.mockResolvedValue(null);
    if (reason === "removed") prisma.dealFile.findFirst.mockResolvedValue(null);
    await expect(service.redeem(token)).rejects.toThrow();
    expect(storage.getObject).not.toHaveBeenCalled();
  });
  it("binds an artifact to its id, not a moving current-version URL", async () => {
    const { service, prisma } = setup();
    const result = await service.prepare("user1", "session1", path.replace(/files\/.+$/, "artifacts/final-pdf"));
    await service.redeem(new URL(result.url).searchParams.get("ticket")!);
    expect(prisma.dealArtifact.findFirst).toHaveBeenLastCalledWith({ where: { id: "file1", deal: { parties: { some: { userId: "user1" } } } } });
  });
  it("rejects arbitrary URLs and malformed tokens", async () => {
    const { service, redis } = setup();
    await expect(service.prepare("u", "s", "https://attacker.test/file")).rejects.toThrow();
    await expect(service.redeem("invalid")).rejects.toThrow();
    expect(redis.get).not.toHaveBeenCalled();
  });
});
