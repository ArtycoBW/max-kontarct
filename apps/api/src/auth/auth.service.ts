import type { AuthSessionResponse, AuthUser } from "@max-contract/contracts";
import { Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { CookieOptions } from "express";
import { createHash, randomBytes } from "node:crypto";

import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../redis/redis.service";
import type {
  AuthSessionContext,
  VerifiedMaxUser,
} from "./auth.types";
import { MaxInitDataVerifier } from "./max-init-data.verifier";
import { MaxReplayProtectionService } from "./max-replay-protection.service";

type AccountWithUser = Prisma.MaxAccountGetPayload<{
  include: { user: true };
}>;

type SessionWithUser = Prisma.UserSessionGetPayload<{
  include: { user: { include: { maxAccount: true } } };
}>;

interface RedisSessionPayload {
  expiresAt: string;
  sessionId: string;
  userId: string;
}

export interface AuthResult {
  response: AuthSessionResponse;
  sessionToken: string;
}

function sessionUnauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: "AUTH_SESSION_INVALID",
    message: "Сессия недействительна или истекла",
  });
}

@Injectable()
export class AuthService {
  private readonly cookieName: string;
  private readonly logger = new Logger(AuthService.name);
  private readonly nodeEnv: string;
  private readonly redisPrefix: string;
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly verifier: MaxInitDataVerifier,
    private readonly replayProtection: MaxReplayProtectionService,
  ) {
    this.cookieName = config.getOrThrow<string>("AUTH_COOKIE_NAME");
    this.nodeEnv = config.getOrThrow<string>("NODE_ENV");
    this.redisPrefix = config.getOrThrow<string>("AUTH_REDIS_PREFIX");
    this.sessionTtlSeconds = config.getOrThrow<number>(
      "AUTH_SESSION_TTL_SECONDS",
    );
  }

  async authenticateMax(
    initData: string,
    requestId?: string,
  ): Promise<AuthResult> {
    const launch = this.verifier.verify(initData);
    await this.replayProtection.claim(launch.queryId, launch.expiresAt);

    try {
      return await this.authenticateUser(
        launch.user,
        "AUTH_MAX_SUCCEEDED",
        requestId,
      );
    } catch (error) {
      await this.replayProtection.release(launch.queryId).catch(() => undefined);
      throw error;
    }
  }

  async authenticateDevelopment(requestId?: string): Promise<AuthResult> {
    if (this.nodeEnv === "production") {
      throw new NotFoundException();
    }

    return this.authenticateUser(
      {
        firstName: this.config.getOrThrow<string>("DEV_MAX_FIRST_NAME"),
        languageCode: this.config.getOrThrow<string>(
          "DEV_MAX_LANGUAGE_CODE",
        ),
        lastName: this.config.getOrThrow<string>("DEV_MAX_LAST_NAME"),
        maxUserId: this.config.getOrThrow<string>("DEV_MAX_USER_ID"),
        username: this.config.getOrThrow<string>("DEV_MAX_USERNAME"),
      },
      "AUTH_DEV_SUCCEEDED",
      requestId,
    );
  }

  async resolveSession(sessionToken: string): Promise<AuthSessionContext> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
      throw sessionUnauthorized();
    }

    const sessionHash = this.hashToken(sessionToken);
    const redisKey = this.sessionKey(sessionHash);
    const rawPayload = await this.redis.get(redisKey);
    if (!rawPayload) {
      throw sessionUnauthorized();
    }

    let payload: RedisSessionPayload;
    try {
      payload = this.parseRedisSession(rawPayload);
    } catch (error) {
      await this.redis.delete(redisKey);
      throw error;
    }
    const session = await this.prisma.userSession.findUnique({
      include: { user: { include: { maxAccount: true } } },
      where: { sessionHash },
    });

    if (!this.isActiveSession(session, payload)) {
      await this.redis.delete(redisKey);
      throw sessionUnauthorized();
    }

    return {
      sessionHash,
      sessionId: session.id,
      user: this.serializeSessionUser(session),
    };
  }

  async logout(session: AuthSessionContext, requestId?: string): Promise<void> {
    await Promise.all([
      this.redis.delete(this.sessionKey(session.sessionHash)),
      this.prisma.userSession.updateMany({
        data: { revokedAt: new Date() },
        where: { id: session.sessionId, revokedAt: null },
      }),
    ]);

    await this.recordAudit(
      session.user.id,
      "AUTH_LOGOUT",
      session.sessionId,
      requestId,
    );
  }

  getCookieName(): string {
    return this.cookieName;
  }

  getCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      maxAge: this.sessionTtlSeconds * 1_000,
      path: "/",
      sameSite: this.nodeEnv === "production" ? "none" : "lax",
      secure: this.nodeEnv === "production",
    };
  }

  getClearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      path: "/",
      sameSite: this.nodeEnv === "production" ? "none" : "lax",
      secure: this.nodeEnv === "production",
    };
  }

  private async authenticateUser(
    maxUser: VerifiedMaxUser,
    eventType: string,
    requestId?: string,
  ): Promise<AuthResult> {
    const authenticatedAt = new Date();
    const account = await this.prisma.maxAccount.upsert({
      create: {
        firstName: maxUser.firstName,
        languageCode: maxUser.languageCode,
        lastAuthenticatedAt: authenticatedAt,
        lastName: maxUser.lastName,
        maxUserId: maxUser.maxUserId,
        user: { create: { lastSeenAt: authenticatedAt } },
        username: maxUser.username,
      },
      include: { user: true },
      update: {
        firstName: maxUser.firstName,
        languageCode: maxUser.languageCode,
        lastAuthenticatedAt: authenticatedAt,
        lastName: maxUser.lastName,
        user: { update: { lastSeenAt: authenticatedAt } },
        username: maxUser.username,
      },
      where: { maxUserId: maxUser.maxUserId },
    });
    const user = this.serializeAccount(account);
    const session = await this.issueSession(user.id);

    await this.recordAudit(user.id, eventType, session.sessionId, requestId);

    return {
      response: { user },
      sessionToken: session.sessionToken,
    };
  }

  private async issueSession(userId: string): Promise<{
    sessionId: string;
    sessionToken: string;
  }> {
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = this.hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1_000);
    const session = await this.prisma.userSession.create({
      data: {
        expiresAt,
        lastSeenAt: new Date(),
        sessionHash,
        userId,
      },
    });

    try {
      await this.redis.setWithExpiry(
        this.sessionKey(sessionHash),
        JSON.stringify({
          expiresAt: expiresAt.toISOString(),
          sessionId: session.id,
          userId,
        } satisfies RedisSessionPayload),
        this.sessionTtlSeconds,
      );
    } catch (error) {
      await this.prisma.userSession
        .update({ data: { revokedAt: new Date() }, where: { id: session.id } })
        .catch(() => undefined);
      throw error;
    }

    return { sessionId: session.id, sessionToken };
  }

  private parseRedisSession(value: string): RedisSessionPayload {
    try {
      const parsed = JSON.parse(value) as Partial<RedisSessionPayload>;
      if (
        typeof parsed.expiresAt === "string" &&
        typeof parsed.sessionId === "string" &&
        typeof parsed.userId === "string"
      ) {
        return parsed as RedisSessionPayload;
      }
    } catch {
      // A malformed server-side session is invalidated below.
    }

    throw sessionUnauthorized();
  }

  private isActiveSession(
    session: SessionWithUser | null,
    payload: RedisSessionPayload,
  ): session is SessionWithUser {
    return Boolean(
      session &&
        !session.revokedAt &&
        session.expiresAt.getTime() > Date.now() &&
        session.id === payload.sessionId &&
        session.userId === payload.userId &&
        session.user.maxAccount,
    );
  }

  private serializeAccount(account: AccountWithUser): AuthUser {
    return {
      id: account.user.id,
      maxAccount: {
        firstName: account.firstName,
        languageCode: account.languageCode,
        lastName: account.lastName,
        maxUserId: account.maxUserId,
        username: account.username,
      },
      role: account.user.role,
    };
  }

  private serializeSessionUser(session: SessionWithUser): AuthUser {
    const account = session.user.maxAccount;
    if (!account) {
      throw sessionUnauthorized();
    }

    return {
      id: session.user.id,
      maxAccount: {
        firstName: account.firstName,
        languageCode: account.languageCode,
        lastName: account.lastName,
        maxUserId: account.maxUserId,
        username: account.username,
      },
      role: session.user.role,
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private sessionKey(sessionHash: string): string {
    return `${this.redisPrefix}:session:${sessionHash}`;
  }

  private async recordAudit(
    actorUserId: string,
    eventType: string,
    sessionId: string,
    requestId?: string,
  ): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId,
          entityId: sessionId,
          entityType: "UserSession",
          eventType,
          metadata: { provider: "MAX" },
          requestId,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, eventType }, "Failed to record auth audit");
    }
  }
}
