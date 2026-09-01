import { createHash, randomBytes } from "node:crypto";

import type { DealArtifactSummary, PublicDocumentVerificationResponse } from "@max-contract/contracts";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DealArtifactType,
  DealFileCategory,
  DealFileReviewStatus,
  DealFileVisibility,
  DealStatus,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import type { FrozenDealSnapshot } from "../deals/deal-version-freeze";
import { normalizeUploadedFilename } from "../files/file-validation";
import { createPrivateObjectKey } from "../storage/file-security";
import { STORAGE_SERVICE, type StorageService, type StoredObject } from "../storage/storage.service";
import { renderFinalContractPdf } from "./final-contract-pdf";
import { buildEvidencePackage } from "./evidence-package";

const finalizationSelect = {
  files: {
    orderBy: { uploadedAt: "asc" as const },
    select: { id: true, mimeType: true, objectKey: true, originalName: true, sha256: true, sizeBytes: true },
    where: {
      OR: [
        { category: DealFileCategory.EVIDENCE },
        { reviewStatus: DealFileReviewStatus.ACCEPTED },
      ],
      visibility: DealFileVisibility.DEAL_PARTICIPANTS,
    },
  },
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

  async ensureEvidencePackage(dealId: string): Promise<DealArtifactSummary> {
    await this.ensureFinalPdf(dealId);
    const record = await this.prisma.deal.findUnique({ select: finalizationSelect, where: { id: dealId } });
    if (!record) throw artifactNotFound();
    const version = requireSignedVersion(record);
    const existing = version.artifacts.find(({ type }) => type === DealArtifactType.EVIDENCE_ZIP);
    if (existing) return toSummary(existing);
    const finalPdf = version.artifacts.find(({ type }) => type === DealArtifactType.FINAL_PDF);
    if (!finalPdf) throw artifactNotFound();
    const pdfObject = await this.storage.getObject(finalPdf.objectKey);
    assertStoredHash(pdfObject.body, finalPdf.sha256);
    const attachmentObjects = await Promise.all(record.files.map(async (file, index) => {
      const object = await this.storage.getObject(file.objectKey);
      assertStoredHash(object.body, file.sha256);
      return {
        body: object.body,
        mimeType: file.mimeType,
        path: `attachments/${String(index + 1).padStart(2, "0")}-${file.id.slice(0, 8)}-${packageFilename(file.originalName)}`,
      };
    }));
    const relevantIds = [dealId, version.id, ...version.signatures.map(({ id }) => id), ...record.files.map(({ id }) => id), ...version.artifacts.map(({ id }) => id)];
    const auditEvents = await this.prisma.auditEvent.findMany({
      orderBy: { createdAt: "asc" },
      select: { actorUserId: true, createdAt: true, entityId: true, entityType: true, eventType: true, id: true, metadata: true, requestId: true },
      where: {
        OR: [
          { entityId: { in: relevantIds } },
          { metadata: { equals: dealId, path: ["dealId"] } },
        ],
      },
    });
    const createdAt = new Date();
    const body = await buildEvidencePackage({
      auditEvents: auditEvents.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      contract: { body: pdfObject.body, mimeType: finalPdf.mimeType, path: `contract/${packageFilename(finalPdf.originalName)}` },
      createdAt,
      files: attachmentObjects,
      signatures: version.signatures.map((signature) => ({
        documentHash: signature.documentHash,
        ipAddress: signature.ipAddress,
        maxUserIdReference: signature.maxUserIdRef,
        otpChannel: signature.otpChannel,
        partyId: signature.partyId,
        pepDocumentVersion: signature.pepDocumentVersion,
        signedAt: signature.signedAt.toISOString(),
        signatureId: signature.id,
        userAgent: signature.userAgent,
        userId: signature.userId,
        verifiedPhoneReference: signature.verifiedPhoneId,
      })),
    });
    const sha256 = createHash("sha256").update(body).digest("hex");
    const objectKey = `${createPrivateObjectKey(dealId)}.zip`;
    await this.storage.putObject({ body, contentType: "application/zip", key: objectKey, sha256 });
    try {
      const artifact = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.dealArtifact.create({ data: {
          bucket: this.bucket,
          dealId,
          dealVersionId: version.id,
          mimeType: "application/zip",
          objectKey,
          originalName: `Материалы-${safeName(version.contractNumber)}.zip`,
          sha256,
          sizeBytes: body.length,
          type: DealArtifactType.EVIDENCE_ZIP,
        } });
        await transaction.auditEvent.create({ data: {
          entityId: created.id,
          entityType: "DealArtifact",
          eventType: "EVIDENCE_PACKAGE_CREATED",
          metadata: { attachmentCount: record.files.length, dealId, fileHash: sha256, sizeBytes: body.length, versionId: version.id },
        } });
        return created;
      });
      return toSummary(artifact);
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      if (isUniqueConflict(error)) {
        const artifact = await this.prisma.dealArtifact.findUnique({
          where: { dealVersionId_type: { dealVersionId: version.id, type: DealArtifactType.EVIDENCE_ZIP } },
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

  async verifyPublic(publicCode: string): Promise<PublicDocumentVerificationResponse> {
    if (!/^[A-Za-z0-9_-]{20}$/.test(publicCode)) throw artifactNotFound();
    const artifact = await this.prisma.dealArtifact.findUnique({
      select: {
        deal: { select: { status: true } },
        dealVersion: {
          select: {
            contractNumber: true,
            signatures: { orderBy: { signedAt: "desc" }, select: { signedAt: true }, take: 1 },
          },
        },
        objectKey: true,
        sha256: true,
        type: true,
      },
      where: { publicCode },
    });
    const signedAt = artifact?.dealVersion.signatures[0]?.signedAt;
    const contractNumber = artifact?.dealVersion.contractNumber;
    if (!artifact || artifact.type !== DealArtifactType.FINAL_PDF || !signedAt || !contractNumber) throw artifactNotFound();
    let integrity: PublicDocumentVerificationResponse["integrity"] = "UNAVAILABLE";
    try {
      const object = await this.storage.getObject(artifact.objectKey);
      integrity = createHash("sha256").update(object.body).digest("hex") === artifact.sha256 ? "VALID" : "INVALID";
    } catch {
      integrity = "UNAVAILABLE";
    }
    return {
      contractNumber,
      documentStatus: artifact.deal.status === DealStatus.COMPLETED ? "COMPLETED" : "SIGNED",
      integrity,
      sha256: artifact.sha256,
      signedAt: signedAt.toISOString(),
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
function packageFilename(value: string): string { return safeName(normalizeUploadedFilename(value)).slice(0, 180) || "file"; }
function assertStoredHash(body: Buffer, expected: string): void {
  if (createHash("sha256").update(body).digest("hex") !== expected) {
    throw new ConflictException({ code: "ARTIFACT_INTEGRITY_FAILED", message: "Контрольная сумма материала не совпала" });
  }
}
function isUniqueConflict(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
function artifactNotFound(): NotFoundException { return new NotFoundException({ code: "DEAL_ARTIFACT_NOT_FOUND", message: "Итоговый документ ещё не готов" }); }
