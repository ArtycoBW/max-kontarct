import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { DealMessageResponse, DealMessagesResponse, SendDealMessageRequest } from "@max-contract/contracts";
import { PrismaService } from "../database/prisma.service";

const authorInclude = { author: { select: { profile: { select: { firstName: true, lastName: true } }, maxAccount: { select: { firstName: true, lastName: true } } } } };

@Injectable()
export class DealMessagesService {
  constructor(private readonly prisma: PrismaService) {}
  private async participant(dealId: string, userId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, parties: { some: { userId } } }, select: { status: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { versionNumber: true } } } });
    if (!deal) throw new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Сделка не найдена" });
    return deal;
  }
  async list(dealId: string, userId: string, before?: string): Promise<DealMessagesResponse> {
    await this.participant(dealId, userId);
    if (before && !await this.prisma.dealMessage.findFirst({ where: { id: before, dealId }, select: { id: true } })) throw new NotFoundException("Сообщение не найдено");
    const rows = await this.prisma.dealMessage.findMany({
      where: { dealId }, include: authorInclude, take: 51,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    return { items: page.reverse().map(row => present(row, userId)), nextCursor: rows.length > 50 ? rows[49]!.id : null };
  }
  async send(dealId: string, userId: string, input: SendDealMessageRequest): Promise<DealMessageResponse> {
    const deal = await this.participant(dealId, userId);
    const body = input.body.trim();
    if (!body) throw new BadRequestException({ code: "MESSAGE_EMPTY", message: "Напишите сообщение" });
    const identity = { dealId_authorId_clientId: { dealId, authorId: userId, clientId: input.clientId } };
    const existing = await this.prisma.dealMessage.findUnique({ where: identity, include: authorInclude });
    const verify = (row: NonNullable<typeof existing>) => {
      if (row.body !== body || row.kind !== input.kind) throw new ConflictException({ code: "MESSAGE_RETRY_CHANGED", message: "Это сообщение уже отправлено. Отправьте изменённый текст новым сообщением." });
      return present(row, userId);
    };
    if (existing) return verify(existing);
    if (input.kind === "CHANGE_REQUEST" && ["SIGNED_BY_ONE", "SIGNED", "COMPLETED", "CANCELED"].includes(deal.status)) throw new ConflictException({ code: "DEAL_VERSIONING_NOT_ALLOWED", message: "Подписанную версию нельзя изменять. Обсудите оформление отдельного соглашения." });
    const row = await this.prisma.dealMessage.upsert({
      where: identity,
      create: { dealId, authorId: userId, clientId: input.clientId, body, kind: input.kind, versionNumber: deal.versions[0]?.versionNumber ?? 1 },
      update: {}, include: authorInclude,
    }).catch(async (error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const raced = await this.prisma.dealMessage.findUnique({ where: identity, include: authorInclude });
        if (raced) return raced;
      }
      throw error;
    });
    return verify(row);
  }
}

function present(row: { id: string; body: string; kind: string; authorId: string; createdAt: Date; versionNumber: number; author: { profile: { firstName: string; lastName: string } | null; maxAccount: { firstName: string | null; lastName: string | null } | null } }, userId: string): DealMessageResponse {
  const name = row.author.profile ?? row.author.maxAccount;
  return { id: row.id, body: row.body, kind: row.kind === "CHANGE_REQUEST" ? "CHANGE_REQUEST" : "MESSAGE", authorName: [name?.firstName, name?.lastName].filter(Boolean).join(" ") || "Участник", isCurrentUser: row.authorId === userId, createdAt: row.createdAt.toISOString(), versionNumber: row.versionNumber };
}
