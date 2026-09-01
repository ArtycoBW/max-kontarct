import { createHash, randomBytes } from "node:crypto";

import type { DealArtifactSummary } from "@max-contract/contracts";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DealArtifactType, DealStatus, Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import type { FrozenDealSnapshot } from "../deals/deal-version-freeze";
import { createPrivateObjectKey } from "../storage/file-security";
import { STORAGE_SERVICE, type StorageService, type StoredObject } from "../storage/storage.service";
import { renderFinalContractPdf } from "./final-contract-pdf";

const finalizationSelect = {
  id: true,
  parties: { select: { id: true } },
  status: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: {
      artifacts: true,
      contractNumber: true,
      frozenSnapshot: true,
      id: true,
      signatures: {
        include: {
          party: { select: { role: true } },
          user: { include: { maxAccount: true, profile: true } },
        },
        orderBy: { signedAt: "asc" as const },
      },
      snapshotHash: true,
      versionNumber: true,
    },
    take: 1,
  },
} satisfies Prisma.DealSelect;

type FinalizationRecord = Prisma.DealGetPayload<{ select: typeof finalizationSelect }>;

@Injectable()
export class DealArtifactsService {
  private readonly bucket: string;
  private readonly publicWebUrl: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.publicWebUrl = config.getOrThrow<string>("PUBLIC_WEB_URL");
  }

  async ensureFinalPdf(dealId: string): Promise<DealArtifactSummary> {
    const record = await this.prisma.deal.findUnique({ select: finalizationSelect, where: { id: dealId } });
    if (!record) throw artifactNotFound();
    const version = requireSignedVersion(record);
    const existing = version.artifacts.find(({ type }) => type === DealArtifactType.FINAL_PDF);
    if (existing) return toSummary(existing);

    const publicCode = randomBytes(15).toString("base64url");
    const verifyUrl = `${this.publicWebUrl}/verify/${publicCode}`;
    const body = await renderFinalContractPdf({
      signatureHash: version.snapshotHash,
      signatures: version.signatures.map((signature) => ({
        displayName: displayName(signature.user),
        otpChannel: signature.otpChannel,
        pepDocumentVersion: signature.pepDocumentVersion,
        role: signature.party.role,
        signedAt: signature.signedAt,
      })),
      snapshot: version.frozenSnapshot as unknown as FrozenDealSnapshot,
      verifyUrl,
    });
    const sha256 = createHash("sha256").update(body).digest("hex");
    const objectKey = `${createPrivateObjectKey(dealId)}.pdf`;
    await this.storage.putObject({ body, contentType: "application/pdf", key: objectKey, sha256 });

    try {
      const artifact = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.dealArtifact.create({ data: {
          bucket: this.bucket,
          dealId,
          dealVersionId: version.id,
          mimeType: "application/pdf",
          objectKey,
          originalName: `Договор-${safeName(version.contractNumber)}.pdf`,
          publicCode,
          sha256,
          sizeBytes: body.length,
          type: DealArtifactType.FINAL_PDF,
        } });
        await transaction.auditEvent.create({ data: {
          entityId: created.id,
          entityType: "DealArtifact",
          eventType: "FINAL_PDF_CREATED",
          metadata: { dealId, documentHash: version.snapshotHash, fileHash: sha256, sizeBytes: body.length, versionId: version.id },
        } });
        return created;
      });
      return toSummary(artifact);
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      if (isUniqueConflict(error)) {
        const artifact = await this.prisma.dealArtifact.findUnique({
          where: { dealVersionId_type: { dealVersionId: version.id, type: DealArtifactType.FINAL_PDF } },
        });
        if (artifact) return toSummary(artifact);
      }
      throw error;
    }
  }

  async download(userId: string, dealId: string, type: DealArtifactType): Promise<{
    artifact: { mimeType: string; originalName: string };
    object: StoredObject;
  }> {
    const artifact = await this.prisma.dealArtifact.findFirst({ where: {
      dealId,
      deal: { parties: { some: { userId } } },
      type,
    } });
    if (!artifact) throw artifactNotFound();
    return {
      artifact: { mimeType: artifact.mimeType, originalName: artifact.originalName },
      object: await this.storage.getObject(artifact.objectKey),
    };
  }
}

function requireSignedVersion(record: FinalizationRecord) {
  const version = record.versions[0];
  if (
    !version || !version.contractNumber || !version.snapshotHash || !version.frozenSnapshot ||
    (record.status !== DealStatus.SIGNED && record.status !== DealStatus.COMPLETED) ||
    version.signatures.length !== record.parties.length
  ) {
    throw new ConflictException({ code: "FINAL_DOCUMENT_NOT_READY", message: "Обе стороны ещё не подписали договор" });
  }
  return version as typeof version & { contractNumber: string; frozenSnapshot: Prisma.JsonValue; snapshotHash: string };
}

function displayName(user: FinalizationRecord["versions"][number]["signatures"][number]["user"]): string {
  const profile = user.profile ?? user.maxAccount;
  return [profile?.lastName, profile?.firstName, profile && "middleName" in profile ? profile.middleName : null].filter(Boolean).join(" ") || "Участник сделки";
}

export function toSummary(artifact: {
  createdAt: Date; dealId: string; id: string; mimeType: string; originalName: string; sha256: string; sizeBytes: bigint; type: DealArtifactType;
}): DealArtifactSummary {
  return {
    createdAt: artifact.createdAt.toISOString(),
    downloadUrl: `/api/v1/deals/${artifact.dealId}/${artifact.type === DealArtifactType.FINAL_PDF ? "artifacts/final-pdf" : "artifacts/evidence-package"}`,
    id: artifact.id,
    mimeType: artifact.mimeType,
    originalName: artifact.originalName,
    sha256: artifact.sha256,
    sizeBytes: Number(artifact.sizeBytes),
    type: artifact.type,
  };
}

function safeName(value: string): string { return value.replace(/[^A-Za-zА-Яа-я0-9_.-]+/g, "-"); }
function isUniqueConflict(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
function artifactNotFound(): NotFoundException { return new NotFoundException({ code: "DEAL_ARTIFACT_NOT_FOUND", message: "Итоговый документ ещё не готов" }); }
