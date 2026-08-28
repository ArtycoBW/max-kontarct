import type {
  AdminAuditListResponse,
  AdminUserListResponse,
} from "@max-contract/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

const ADMIN_LIST_LIMIT = 100;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(): Promise<AdminUserListResponse> {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          id: true,
          lastSeenAt: true,
          maxAccount: { select: { firstName: true, lastName: true } },
          profile: {
            select: { firstName: true, lastName: true, middleName: true },
          },
          role: true,
        },
        take: ADMIN_LIST_LIMIT,
      }),
      this.prisma.user.count(),
    ]);

    return {
      items: users.map((user) => ({
        createdAt: user.createdAt.toISOString(),
        displayName: displayName(user.profile, user.maxAccount),
        id: user.id,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        profileCompleted: Boolean(user.profile),
        role: user.role,
      })),
      total,
    };
  }

  async listAuditEvents(): Promise<AdminAuditListResponse> {
    const [events, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          actorUserId: true,
          createdAt: true,
          entityId: true,
          entityType: true,
          eventType: true,
          id: true,
          requestId: true,
        },
        take: ADMIN_LIST_LIMIT,
      }),
      this.prisma.auditEvent.count(),
    ]);

    return {
      items: events.map((event) => ({
        actorUserId: event.actorUserId,
        createdAt: event.createdAt.toISOString(),
        entityId: event.entityId,
        entityType: event.entityType,
        eventType: event.eventType,
        id: event.id,
        requestId: event.requestId,
      })),
      total,
    };
  }
}

function displayName(
  profile: { firstName: string; lastName: string; middleName: string | null } | null,
  maxAccount: { firstName: string | null; lastName: string | null } | null,
): string {
  const values = profile
    ? [profile.lastName, profile.firstName, profile.middleName]
    : [maxAccount?.lastName, maxAccount?.firstName];
  return values.filter(Boolean).join(" ") || "Пользователь MAX";
}
