import { createHash } from "node:crypto";
import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { MaxBotService } from "../max-bot/max-bot.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.service";

@Injectable()
export class ArtifactDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArtifactDeliveryWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(private readonly prisma: PrismaService, private readonly max: MaxBotService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running) this.running = this.tick().catch(() => this.logger.warn("Document delivery poll failed"))
        .finally(() => { this.running = undefined; });
    }, 5_000);
    this.timer.unref();
  }
  async onModuleDestroy() { clearInterval(this.timer); await this.running; }

  async tick(): Promise<void> {
    const now = new Date();
    const due = { status: "PENDING", nextAttemptAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };
    const job = await this.prisma.artifactDelivery.findFirst({ where: due, orderBy: { nextAttemptAt: "asc" }, include: {
      artifact: true, user: { select: { maxAccount: { select: { maxUserId: true } } } },
    } });
    if (!job) return;
    const leaseUntil = new Date(now.getTime() + 5 * 60_000);
    const claimed = await this.prisma.artifactDelivery.updateMany({ where: { id: job.id, ...due }, data: { leaseUntil, attempts: { increment: 1 } } });
    if (!claimed.count) return;
    const lease = { id: job.id, leaseUntil, status: "PENDING" };
    try {
      const maxUserId = job.user.maxAccount?.maxUserId ?? "";
      const participant = await this.prisma.dealParty.findFirst({ where: { dealId: job.artifact.dealId, userId: job.userId }, select: { id: true } });
      if (!participant || !(await this.max.canSendDocuments(maxUserId))) {
        await this.prisma.artifactDelivery.updateMany({ where: lease, data: { status: "SKIPPED", leaseUntil: null, uploadToken: null } });
        return;
      }
      let token = job.uploadToken;
      if (!token) {
        const object = await this.storage.getObject(job.artifact.objectKey);
        if (createHash("sha256").update(object.body).digest("hex") !== job.artifact.sha256) throw new Error("ARTIFACT_INTEGRITY_ERROR");
        token = await this.max.uploadDocument(object.body, job.artifact.mimeType, job.artifact.originalName);
        await this.prisma.artifactDelivery.updateMany({ where: lease, data: { uploadToken: token } });
      }
      await this.max.sendDocument(maxUserId, token, job.artifact.type === "FINAL_PDF"
        ? "Подписанный обеими сторонами договор. Файл можно скачать и сохранить."
        : "Пакет материалов сделки: договор, общие приложения, история и сведения о подписях.");
      await this.prisma.artifactDelivery.updateMany({ where: lease, data: { status: "SENT", sentAt: new Date(), leaseUntil: null, uploadToken: null } });
    } catch {
      const failed = job.attempts + 1 >= 12;
      await this.prisma.artifactDelivery.updateMany({ where: lease, data: {
        status: failed ? "FAILED" : "PENDING", leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 10_000 * 2 ** job.attempts)),
      } });
      if (failed) this.logger.error({ deliveryId: job.id }, "Final documents could not be delivered to MAX");
    }
  }
}
