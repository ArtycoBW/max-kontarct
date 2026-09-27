import { createHash, randomBytes } from "node:crypto";
import { Body, Controller, Get, Header, Injectable, Module, NotFoundException, Post, Query, Req, StreamableFile, UseGuards, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Matches } from "class-validator";
import { AuthModule } from "../auth/auth.module";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../redis/redis.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.service";
import { normalizeUploadedFilename } from "../files/file-validation";

const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const PATH = new RegExp(`^/api/v1/deals/(${uuid})/(?:files/(${uuid})/content|artifacts/(final-pdf|evidence-package))$`, "i");
class DownloadRequest { @Matches(PATH) path!: string; }
type Grant = { userId: string; sessionId: string; kind: "file" | "artifact"; id: string };
const unavailable = () => new NotFoundException({ code: "DOWNLOAD_EXPIRED", message: "Ссылка недоступна или истекла. Подготовьте скачивание ещё раз." });

@Injectable()
export class NativeDownloadsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService, private readonly config: ConfigService, @Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  async prepare(userId: string, sessionId: string, path: string) {
    const match = PATH.exec(path);
    if (!match) throw unavailable();
    const [, dealId, fileId, artifact] = match;
    const record = fileId
      ? await this.prisma.dealFile.findFirst({ where: { id: fileId, dealId, deal: { parties: { some: { userId } } }, OR: [{ ownerUserId: userId }, { visibility: "DEAL_PARTICIPANTS" }] } })
      : await this.prisma.dealArtifact.findFirst({ where: { dealId, type: artifact === "final-pdf" ? "FINAL_PDF" : "EVIDENCE_ZIP", deal: { parties: { some: { userId } } } }, orderBy: { createdAt: "desc" } });
    if (!record) throw unavailable();
    const token = randomBytes(32).toString("base64url");
    const grant: Grant = { userId, sessionId, kind: fileId ? "file" : "artifact", id: record.id };
    await this.redis.setWithExpiry(this.key(token), JSON.stringify(grant), 120);
    return { url: `${this.config.getOrThrow<string>("PUBLIC_WEB_URL")}/api/v1/downloads/content?ticket=${token}`, filename: normalizeUploadedFilename(record.originalName), expiresAt: new Date(Date.now() + 120_000).toISOString() };
  }

  async redeem(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unavailable();
    const raw = await this.redis.get(this.key(token));
    if (!raw) throw unavailable();
    const grant = JSON.parse(raw) as Grant;
    const session = await this.prisma.userSession.findFirst({ where: { id: grant.sessionId, userId: grant.userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) throw unavailable();
    // Recheck participant/private-file ACL at redemption, not only at issuance.
    const record = grant.kind === "file"
      ? await this.prisma.dealFile.findFirst({ where: { id: grant.id, deal: { parties: { some: { userId: grant.userId } } }, OR: [{ ownerUserId: grant.userId }, { visibility: "DEAL_PARTICIPANTS" }] } })
      : await this.prisma.dealArtifact.findFirst({ where: { id: grant.id, deal: { parties: { some: { userId: grant.userId } } } } });
    if (!record) throw unavailable();
    return { object: await this.storage.getObject(record.objectKey), filename: normalizeUploadedFilename(record.originalName), mimeType: record.mimeType };
  }
  private key(token: string) { return `native-download:${createHash("sha256").update(token).digest("hex")}`; }
}

@Controller("downloads")
export class NativeDownloadsController {
  constructor(private readonly downloads: NativeDownloadsService) {}
  @Post("prepare")
  @UseGuards(SessionAuthGuard)
  @Header("Cache-Control", "no-store")
  prepare(@Body() body: DownloadRequest, @Req() req: AuthenticatedRequest) { return this.downloads.prepare(req.auth.user.id, req.auth.sessionId, body.path); }

  // Android's native downloader has no WebView session cookie. A short-lived,
  // resource-scoped capability is used instead; query strings are redacted in logs.
  @Get("content")
  @Header("Cache-Control", "private, no-store")
  @Header("Referrer-Policy", "no-referrer")
  async content(@Query("ticket") ticket: string) {
    const file = await this.downloads.redeem(ticket);
    return new StreamableFile(file.object.body, { type: file.mimeType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
  }
}

@Module({ imports: [AuthModule], controllers: [NativeDownloadsController], providers: [NativeDownloadsService] })
export class NativeDownloadsModule {}
