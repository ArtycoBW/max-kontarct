import type {
  AdminFileReviewItem,
  AdminFileReviewListResponse,
  DealDocumentsWorkspaceResponse,
  DealFileResponse,
  UploadDealFileRequest,
  ReviewDealFileRequest,
} from "@max-contract/contracts";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DealFileCategory,
  DealFileReviewStatus,
  DealFileVisibility,
  Prisma,
  TrustCheckSource,
  TrustCheckStatus,
  TrustCheckType,
} from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { calculateSha256, createPrivateObjectKey } from "../storage/file-security";
import {
  STORAGE_SERVICE,
  type StorageService,
  type StoredObject,
} from "../storage/storage.service";
import {
  ALLOWED_FILE_MIME_TYPES,
  normalizeUploadedFilename,
  validateUploadedFile,
} from "./file-validation";

const PRIVATE_REQUIREMENT_PATTERN = /(passport|identity|personal|удостовер|паспорт)/i;

@Injectable()
export class FilesService {
  private readonly bucket: string;
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>("S3_BUCKET");
    this.maxUploadBytes = config.getOrThrow<number>("FILE_UPLOAD_MAX_BYTES");
  }

  async getWorkspace(userId: string, dealId: string): Promise<DealDocumentsWorkspaceResponse> {
    const deal = await this.loadDealForParticipant(userId, dealId);
    const files = await this.prisma.dealFile.findMany({
      include: {
        owner: { include: { maxAccount: true, profile: true } },
      },
      orderBy: { uploadedAt: "desc" },
      where: {
        dealId,
        OR: [
          { ownerUserId: userId },
          { visibility: DealFileVisibility.DEAL_PARTICIPANTS },
        ],
      },
    });
    const format = (file: typeof files[number]) => toFileResponse(file, userId);
    return {
      allowedMimeTypes: [...ALLOWED_FILE_MIME_TYPES],
      dealId,
      dealStatus: deal.status,
      dealTitle: deal.title,
      evidenceFiles: files.filter(({ category }) => category === DealFileCategory.EVIDENCE).map(format),
      maxUploadBytes: this.maxUploadBytes,
      requirements: deal.templateVersion.documentRequirements.map((requirement) => ({
        description: requirement.description,
        id: requirement.id,
        required: requirement.required,
        title: requirement.title,
        uploads: files.filter((file) => file.requirementId === requirement.id).map(format),
      })),
    };
  }

  async upload(
    userId: string,
    dealId: string,
    input: UploadDealFileRequest,
    file: Express.Multer.File,
    requestId?: string,
  ): Promise<DealFileResponse> {
    const deal = await this.loadDealForParticipant(userId, dealId);
    const requirement = input.requirementId
      ? deal.templateVersion.documentRequirements.find(({ id }) => id === input.requirementId)
      : null;
    if (input.category === "REQUIREMENT" && !requirement) {
      throw new BadRequestException({
        code: "FILE_REQUIREMENT_INVALID",
        message: "Выберите требование к документу из этой сделки",
      });
    }
    if (input.category === "EVIDENCE" && input.requirementId) {
      throw new BadRequestException({
        code: "FILE_CATEGORY_INVALID",
        message: "Для материала сделки не выбирают обязательный документ",
      });
    }
    const validated = validateUploadedFile(file, this.maxUploadBytes);
    const sha256 = calculateSha256(file.buffer);
    const objectKey = createPrivateObjectKey(dealId);
    const visibility = resolveFileVisibility(requirement ?? null);
    await this.storage.putObject({
      body: file.buffer,
      contentType: validated.mimeType,
      key: objectKey,
      sha256,
    });

    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.dealFile.create({
          data: {
            bucket: this.bucket,
            category: input.category,
            dealId,
            mimeType: validated.mimeType,
            objectKey,
            originalName: validated.originalName,
            ownerUserId: userId,
            requirementId: requirement?.id ?? null,
            sha256,
            sizeBytes: file.buffer.length,
            visibility,
          },
          include: { owner: { include: { maxAccount: true, profile: true } } },
        });
        await transaction.auditEvent.create({
          data: {
            actorUserId: userId,
            entityId: record.id,
            entityType: "DealFile",
            eventType: "DEAL_FILE_UPLOADED",
            metadata: {
              category: record.category,
              dealId,
              mimeType: record.mimeType,
              sizeBytes: Number(record.sizeBytes),
              visibility: record.visibility,
            },
            requestId,
          },
        });
        await syncRequiredFilesTrust(transaction, userId, dealId, deal.templateVersion.documentRequirements);
        return record;
      });
      return toFileResponse(created, userId);
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async download(userId: string, dealId: string, fileId: string): Promise<{
    file: { mimeType: string; originalName: string };
    object: StoredObject;
  }> {
    await this.loadDealForParticipant(userId, dealId);
    const file = await this.prisma.dealFile.findFirst({ where: { dealId, id: fileId } });
    if (!file) throw fileNotFound();
    if (file.ownerUserId !== userId && file.visibility !== DealFileVisibility.DEAL_PARTICIPANTS) {
      throw fileNotFound();
    }
    return {
      file: { mimeType: file.mimeType, originalName: normalizeUploadedFilename(file.originalName) },
      object: await this.storage.getObject(file.objectKey),
    };
  }

  async listForAdmin(): Promise<AdminFileReviewListResponse> {
    const [files, total] = await Promise.all([
      this.prisma.dealFile.findMany({
        include: {
          deal: { select: { title: true } },
          owner: { include: { maxAccount: true, profile: true } },
          requirement: { select: { title: true } },
        },
        orderBy: [{ reviewStatus: "asc" }, { uploadedAt: "desc" }],
        take: 200,
      }),
      this.prisma.dealFile.count(),
    ]);
    return { items: files.map(toAdminFileReviewItem), total };
  }

  async adminDownload(fileId: string): Promise<{
    file: { mimeType: string; originalName: string };
    object: StoredObject;
  }> {
    const file = await this.prisma.dealFile.findUnique({ where: { id: fileId } });
    if (!file) throw fileNotFound();
    return {
      file: { mimeType: file.mimeType, originalName: normalizeUploadedFilename(file.originalName) },
      object: await this.storage.getObject(file.objectKey),
    };
  }

  async review(
    reviewerUserId: string,
    fileId: string,
    input: ReviewDealFileRequest,
    requestId?: string,
  ): Promise<AdminFileReviewItem> {
    const comment = input.comment?.trim() || null;
    if (input.status === "REJECTED" && (!comment || comment.length < 3)) {
      throw new BadRequestException({
        code: "FILE_REVIEW_COMMENT_REQUIRED",
        message: "При отклонении укажите комментарий не короче трёх символов",
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.dealFile.findUnique({ where: { id: fileId } });
      if (!current) throw fileNotFound();
      const file = await transaction.dealFile.update({
        data: {
          reviewComment: comment,
          reviewedAt: new Date(),
          reviewedByUserId: reviewerUserId,
          reviewStatus: input.status,
        },
        include: {
          deal: { select: { title: true } },
          owner: { include: { maxAccount: true, profile: true } },
          requirement: { select: { title: true } },
        },
        where: { id: fileId },
      });
      await transaction.auditEvent.create({
        data: {
          actorUserId: reviewerUserId,
          entityId: fileId,
          entityType: "DealFile",
          eventType: "DEAL_FILE_REVIEWED",
          metadata: {
            commentProvided: Boolean(comment),
            dealId: file.dealId,
            ownerUserId: file.ownerUserId,
            status: file.reviewStatus,
          },
          requestId,
        },
      });
      await syncInternalReviewTrust(transaction, file.ownerUserId, file.dealId, file.reviewStatus);
      return toAdminFileReviewItem(file);
    });
  }

  private async loadDealForParticipant(userId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      include: {
        parties: { select: { userId: true } },
        templateVersion: {
          include: { documentRequirements: { orderBy: [{ sortOrder: "asc" }, { title: "asc" }] } },
        },
      },
      where: { id: dealId },
    });
    if (!deal) throw new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Сделка не найдена" });
    if (!deal.parties.some((party) => party.userId === userId)) {
      throw new NotFoundException({ code: "DEAL_NOT_FOUND", message: "Сделка не найдена" });
    }
    return deal;
  }
}

async function syncInternalReviewTrust(
  transaction: Prisma.TransactionClient,
  userId: string,
  dealId: string,
  latestStatus: DealFileReviewStatus,
): Promise<void> {
  const deal = await transaction.deal.findUnique({
    select: {
      templateVersion: {
        select: { documentRequirements: { select: { id: true, required: true } } },
      },
    },
    where: { id: dealId },
  });
  if (!deal) return;
  const requiredIds = deal.templateVersion.documentRequirements
    .filter(({ required }) => required)
    .map(({ id }) => id);
  const accepted = requiredIds.length
    ? await transaction.dealFile.findMany({
        distinct: ["requirementId"],
        select: { requirementId: true },
        where: {
          dealId,
          ownerUserId: userId,
          requirementId: { in: requiredIds },
          reviewStatus: DealFileReviewStatus.ACCEPTED,
        },
      })
    : [];
  const status = latestStatus === DealFileReviewStatus.REJECTED
    ? TrustCheckStatus.REJECTED
    : accepted.length === requiredIds.length
      ? TrustCheckStatus.CONFIRMED
      : TrustCheckStatus.PENDING;
  await transaction.userTrustCheck.upsert({
    create: {
      checkedAt: status === TrustCheckStatus.PENDING ? null : new Date(),
      source: TrustCheckSource.ADMIN,
      status,
      type: TrustCheckType.INTERNAL_REVIEW,
      userId,
    },
    update: {
      checkedAt: status === TrustCheckStatus.PENDING ? null : new Date(),
      source: TrustCheckSource.ADMIN,
      status,
    },
    where: { userId_type: { type: TrustCheckType.INTERNAL_REVIEW, userId } },
  });
}

export function resolveFileVisibility(
  requirement: { key: string; title: string } | null,
): DealFileVisibility {
  if (!requirement) return DealFileVisibility.DEAL_PARTICIPANTS;
  return PRIVATE_REQUIREMENT_PATTERN.test(`${requirement.key} ${requirement.title}`)
    ? DealFileVisibility.OWNER_ONLY
    : DealFileVisibility.DEAL_PARTICIPANTS;
}

async function syncRequiredFilesTrust(
  transaction: Prisma.TransactionClient,
  userId: string,
  dealId: string,
  requirements: Array<{ id: string; required: boolean }>,
): Promise<void> {
  const requiredIds = requirements.filter(({ required }) => required).map(({ id }) => id);
  const uploads = requiredIds.length
    ? await transaction.dealFile.findMany({
        distinct: ["requirementId"],
        select: { requirementId: true },
        where: { dealId, ownerUserId: userId, requirementId: { in: requiredIds } },
      })
    : [];
  const complete = uploads.length === requiredIds.length;
  const current = await transaction.userTrustCheck.findUnique({
    where: { userId_type: { type: TrustCheckType.REQUIRED_FILES, userId } },
  });
  if (!complete && current?.status === TrustCheckStatus.CONFIRMED) return;
  const checkedAt = complete ? new Date() : null;
  await transaction.userTrustCheck.upsert({
    create: {
      checkedAt,
      source: TrustCheckSource.FILES,
      status: complete ? TrustCheckStatus.CONFIRMED : TrustCheckStatus.PENDING,
      type: TrustCheckType.REQUIRED_FILES,
      userId,
    },
    update: {
      checkedAt,
      source: TrustCheckSource.FILES,
      status: complete ? TrustCheckStatus.CONFIRMED : TrustCheckStatus.PENDING,
    },
    where: { userId_type: { type: TrustCheckType.REQUIRED_FILES, userId } },
  });
}

function toFileResponse(
  file: {
    category: DealFileCategory;
    id: string;
    mimeType: string;
    originalName: string;
    owner: { maxAccount: { firstName: string | null; lastName: string | null } | null; profile: { firstName: string; lastName: string } | null };
    ownerUserId: string;
    requirementId: string | null;
    reviewComment: string | null;
    reviewStatus: "PENDING" | "ACCEPTED" | "REJECTED";
    sha256: string;
    sizeBytes: bigint;
    uploadedAt: Date;
    visibility: DealFileVisibility;
  },
  currentUserId: string,
): DealFileResponse {
  const person = file.owner.profile ?? file.owner.maxAccount;
  return {
    category: file.category,
    id: file.id,
    mimeType: file.mimeType,
    originalName: normalizeUploadedFilename(file.originalName),
    owner: {
      displayName: [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Участник сделки",
      isCurrentUser: file.ownerUserId === currentUserId,
    },
    requirementId: file.requirementId,
    reviewComment: file.reviewComment,
    reviewStatus: file.reviewStatus,
    sha256: file.sha256,
    sizeBytes: Number(file.sizeBytes),
    uploadedAt: file.uploadedAt.toISOString(),
    visibility: file.visibility,
  };
}

function fileNotFound(): NotFoundException {
  return new NotFoundException({ code: "FILE_NOT_FOUND", message: "Файл не найден" });
}

function toAdminFileReviewItem(file: {
  deal: { title: string };
  dealId: string;
  id: string;
  mimeType: string;
  originalName: string;
  owner: { maxAccount: { firstName: string | null; lastName: string | null } | null; profile: { firstName: string; lastName: string } | null };
  requirement: { title: string } | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  reviewStatus: DealFileReviewStatus;
  sizeBytes: bigint;
  uploadedAt: Date;
  visibility: DealFileVisibility;
}): AdminFileReviewItem {
  const person = file.owner.profile ?? file.owner.maxAccount;
  return {
    dealId: file.dealId,
    dealTitle: file.deal.title,
    id: file.id,
    mimeType: file.mimeType,
    originalName: normalizeUploadedFilename(file.originalName),
    ownerDisplayName: [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Пользователь MAX",
    requirementTitle: file.requirement?.title ?? null,
    reviewComment: file.reviewComment,
    reviewedAt: file.reviewedAt?.toISOString() ?? null,
    reviewStatus: file.reviewStatus,
    sizeBytes: Number(file.sizeBytes),
    uploadedAt: file.uploadedAt.toISOString(),
    visibility: file.visibility,
  };
}
