import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { DealMessagesService } from "./deal-messages.service";

describe("DealMessagesService", () => {
  const prisma = {
    deal: { findFirst: jest.fn() },
    dealMessage: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  };
  const service = new DealMessagesService(prisma as unknown as PrismaService);
  const input = { body: "Нужно изменить дату", kind: "CHANGE_REQUEST" as const, clientId: "client" };
  const row = { id: "message", ...input, authorId: "user", versionNumber: 2, createdAt: new Date("2026-01-01"), author: { profile: { firstName: "Иван", lastName: "Примеров" }, maxAccount: null } };
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.deal.findFirst.mockResolvedValue({ status: "TERMS_REVIEW", versions: [{ versionNumber: 2 }] });
    prisma.dealMessage.findUnique.mockResolvedValue(null);
    prisma.dealMessage.upsert.mockResolvedValue(row);
    prisma.dealMessage.findMany.mockResolvedValue([]);
  });
  it("checks membership before reading or writing messages", async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    await expect(service.list("deal", "outsider")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.send("deal", "outsider", input)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dealMessage.findMany).not.toHaveBeenCalled();
    expect(prisma.dealMessage.upsert).not.toHaveBeenCalled();
    expect(prisma.deal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "deal", parties: { some: { userId: "outsider" } } } }));
  });
  it("rejects empty text after trimming", async () => {
    await expect(service.send("deal", "user", { ...input, body: "  \n " })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.dealMessage.upsert).not.toHaveBeenCalled();
  });
  it("records the current version and returns only participant-visible author data", async () => {
    const result = await service.send("deal", "user", { ...input, body: ` ${input.body} ` });
    expect(prisma.dealMessage.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ versionNumber: 2, body: input.body, authorId: "user" }) as unknown }));
    expect(result).toEqual({ id: "message", body: input.body, kind: "CHANGE_REQUEST", versionNumber: 2, authorName: "Иван Примеров", isCurrentUser: true, createdAt: row.createdAt.toISOString() });
  });
  it("replays an identical request without adding a second message, even after signature", async () => {
    prisma.deal.findFirst.mockResolvedValue({ status: "SIGNED", versions: [{ versionNumber: 2 }] });
    prisma.dealMessage.findUnique.mockResolvedValue(row);
    expect((await service.send("deal", "user", input)).id).toBe("message");
    expect(prisma.dealMessage.upsert).not.toHaveBeenCalled();
    await expect(service.send("deal", "user", { ...input, body: "Другой текст" })).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(["SIGNED_BY_ONE", "SIGNED", "COMPLETED", "CANCELED"])("blocks new revision proposals in %s, but retains plain discussion", async status => {
    prisma.deal.findFirst.mockResolvedValue({ status, versions: [{ versionNumber: 2 }] });
    await expect(service.send("deal", "user", input)).rejects.toBeInstanceOf(ConflictException);
    prisma.dealMessage.upsert.mockResolvedValue({ ...row, kind: "MESSAGE" });
    expect((await service.send("deal", "user", { ...input, kind: "MESSAGE" })).kind).toBe("MESSAGE");
  });
  it("handles a concurrent duplicate and refuses reuse with different text", async () => {
    prisma.dealMessage.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    prisma.dealMessage.upsert.mockRejectedValueOnce({ code: "P2002" });
    expect((await service.send("deal", "user", input)).id).toBe("message");
    prisma.dealMessage.findUnique.mockResolvedValue(null);
    prisma.dealMessage.upsert.mockResolvedValue({ ...row, body: "Отправленный раньше текст" });
    await expect(service.send("deal", "user", input)).rejects.toBeInstanceOf(ConflictException);
  });
  it("paginates chronologically without exposing a cursor from another deal", async () => {
    prisma.dealMessage.findFirst.mockResolvedValue(null);
    await expect(service.list("deal", "user", "foreign")).rejects.toBeInstanceOf(NotFoundException);
    prisma.dealMessage.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ ...row, id: String(51 - i) })));
    const page = await service.list("deal", "user");
    expect(page.items).toHaveLength(50);
    expect(page.items[0]?.id).toBe("2");
    expect(page.items.at(-1)?.id).toBe("51");
    expect(page.nextCursor).toBe("2");
  });
});
