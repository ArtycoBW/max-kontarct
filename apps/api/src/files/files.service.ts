import type {
  DealDocumentsWorkspaceResponse,
  DealFileResponse,
  UploadDealFileRequest,
} from "@max-contract/contracts";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DealFileCategory,
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
import { ALLOWED_FILE_MIME_TYPES, validateUploadedFile } from "./file-validation";

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
    const visibility = requirement && PRIVATE_REQUIREMENT_PATTERN.test(`${requirement.key} ${requirement.title}`)
      ? DealFileVisibility.OWNER_ONLY
      : DealFileVisibility.DEAL_PARTICIPANTS;
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
      file: { mimeType: file.mimeType, originalName: file.originalName },
      object: await this.storage.getObject(file.objectKey),
    };
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
      throw new ForbiddenException({ code: "DEAL_ACCESS_DENIED", message: "Нет доступа к сделке" });
    }
    return deal;
  }
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
    originalName: file.originalName,
    owner: {
      displayName: [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Участник сделки",
      isCurrentUser: file.ownerUserId === currentUserId,
    },
    requirementId: file.requirementId,
    sha256: file.sha256,
    sizeBytes: Number(file.sizeBytes),
    uploadedAt: file.uploadedAt.toISOString(),
    visibility: file.visibility,
  };
}

function fileNotFound(): NotFoundException {
  return new NotFoundException({ code: "FILE_NOT_FOUND", message: "Файл не найден" });
}
