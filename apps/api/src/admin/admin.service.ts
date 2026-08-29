import type {
  AdminAiGenerationListResponse,
  AdminAuditListResponse,
  AdminContractTemplate,
  AdminTemplateListResponse,
  AdminTemplateVersion,
  AdminUserListResponse,
  UpdateAdminTemplateVersionRequest,
} from "@max-contract/contracts";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TemplateVersionStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { TemplateSchemaValidator } from "../templates/template-schema.validator";

const ADMIN_LIST_LIMIT = 100;
const templateVersionInclude = {
  documentRequirements: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.ContractTemplateVersionInclude;
const adminTemplateInclude = {
  versions: {
    include: templateVersionInclude,
    orderBy: { versionNumber: "desc" as const },
  },
} satisfies Prisma.ContractTemplateInclude;

type AdminTemplateRecord = Prisma.ContractTemplateGetPayload<{
  include: typeof adminTemplateInclude;
}>;
type AdminTemplateVersionRecord = Prisma.ContractTemplateVersionGetPayload<{
  include: typeof templateVersionInclude;
}>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schemaValidator: TemplateSchemaValidator,
  ) {}

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

  async listTemplates(): Promise<AdminTemplateListResponse> {
    const [templates, total] = await Promise.all([
      this.prisma.contractTemplate.findMany({
        include: adminTemplateInclude,
        orderBy: { title: "asc" },
        take: ADMIN_LIST_LIMIT,
      }),
      this.prisma.contractTemplate.count(),
    ]);

    return { items: templates.map(toAdminTemplate), total };
  }

  async createDraftVersion(
    templateId: string,
    actorUserId: string,
    requestId?: string,
  ): Promise<AdminTemplateVersion> {
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.contractTemplate.findUnique({
        include: adminTemplateInclude,
        where: { id: templateId },
      });
      if (!template) throw templateNotFound();
      if (
        template.versions.some(
          ({ status }) => status === TemplateVersionStatus.DRAFT,
        )
      ) {
        throw new ConflictException({
          code: "TEMPLATE_DRAFT_EXISTS",
          message: "У шаблона уже есть черновая версия",
        });
      }

      const source =
        template.versions.find(
          ({ status }) => status === TemplateVersionStatus.PUBLISHED,
        ) ?? template.versions[0];
      if (!source) {
        throw new ConflictException({
          code: "TEMPLATE_VERSION_SOURCE_MISSING",
          message: "У шаблона нет версии для создания черновика",
        });
      }

      const created = await transaction.contractTemplateVersion.create({
        data: {
          documentRequirements: {
            create: source.documentRequirements.map((requirement) => ({
              description: requirement.description,
              key: requirement.key,
              required: requirement.required,
              sortOrder: requirement.sortOrder,
              title: requirement.title,
            })),
          },
          questionnaireSchema: asInputJsonObject(source.questionnaireSchema),
          status: TemplateVersionStatus.DRAFT,
          templateId,
          versionNumber:
            Math.max(
              ...template.versions.map(({ versionNumber }) => versionNumber),
            ) + 1,
        },
        include: templateVersionInclude,
      });
      await recordTemplateAudit(transaction, {
        actorUserId,
        eventType: "ADMIN_TEMPLATE_VERSION_CREATED",
        requestId,
        version: created,
      });
      return toAdminTemplateVersion(created);
    });
  }

  async updateDraftVersion(
    templateId: string,
    versionId: string,
    input: UpdateAdminTemplateVersionRequest,
    actorUserId: string,
    requestId?: string,
  ): Promise<AdminTemplateVersion> {
    if (!input.documentRequirements && !input.questionnaireSchema) {
      throw new BadRequestException({
        code: "TEMPLATE_VERSION_UPDATE_EMPTY",
        message: "Укажите изменения версии шаблона",
      });
    }
    if (input.documentRequirements) {
      assertUniqueRequirementKeys(input.documentRequirements);
    }
    if (input.questionnaireSchema) {
      assertEditableSchema(
        this.schemaValidator,
        versionId,
        input.questionnaireSchema,
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const version = await transaction.contractTemplateVersion.findFirst({
        include: templateVersionInclude,
        where: { id: versionId, templateId },
      });
      if (!version) throw versionNotFound();
      if (version.status !== TemplateVersionStatus.DRAFT) throw draftRequired();

      if (input.documentRequirements) {
        await transaction.templateDocumentRequirement.deleteMany({
          where: { templateVersionId: versionId },
        });
        if (input.documentRequirements.length > 0) {
          await transaction.templateDocumentRequirement.createMany({
            data: input.documentRequirements.map((requirement) => ({
              ...requirement,
              description: normalizeOptionalText(requirement.description),
              key: requirement.key.trim(),
              templateVersionId: versionId,
              title: requirement.title.trim(),
            })),
          });
        }
      }
      if (input.questionnaireSchema) {
        await transaction.contractTemplateVersion.update({
          data: {
            questionnaireSchema: asInputJsonObject(input.questionnaireSchema),
          },
          where: { id: versionId },
        });
      }
      const updated =
        await transaction.contractTemplateVersion.findUniqueOrThrow({
          include: templateVersionInclude,
          where: { id: versionId },
        });
      await recordTemplateAudit(transaction, {
        actorUserId,
        eventType: "ADMIN_TEMPLATE_VERSION_UPDATED",
        requestId,
        version: updated,
      });
      return toAdminTemplateVersion(updated);
    });
  }

  async publishDraftVersion(
    templateId: string,
    versionId: string,
    actorUserId: string,
    requestId?: string,
  ): Promise<AdminTemplateVersion> {
    const candidate = await this.prisma.contractTemplateVersion.findFirst({
      include: templateVersionInclude,
      where: { id: versionId, templateId },
    });
    if (!candidate) throw versionNotFound();
    if (candidate.status !== TemplateVersionStatus.DRAFT) throw draftRequired();
    assertEditableSchema(
      this.schemaValidator,
      versionId,
      asJsonObject(candidate.questionnaireSchema),
    );

    return this.prisma.$transaction(async (transaction) => {
      const publishedAt = new Date();
      await transaction.contractTemplateVersion.updateMany({
        data: {
          archivedAt: publishedAt,
          status: TemplateVersionStatus.ARCHIVED,
        },
        where: { templateId, status: TemplateVersionStatus.PUBLISHED },
      });
      const promoted = await transaction.contractTemplateVersion.updateMany({
        data: {
          archivedAt: null,
          publishedAt,
          status: TemplateVersionStatus.PUBLISHED,
        },
        where: {
          id: versionId,
          templateId,
          status: TemplateVersionStatus.DRAFT,
        },
      });
      if (promoted.count !== 1) throw draftRequired();

      const updated =
        await transaction.contractTemplateVersion.findUniqueOrThrow({
          include: templateVersionInclude,
          where: { id: versionId },
        });
      await recordTemplateAudit(transaction, {
        actorUserId,
        eventType: "ADMIN_TEMPLATE_VERSION_PUBLISHED",
        requestId,
        version: updated,
      });
      return toAdminTemplateVersion(updated);
    });
  }

  async archiveDraftVersion(
    templateId: string,
    versionId: string,
    actorUserId: string,
    requestId?: string,
  ): Promise<AdminTemplateVersion> {
    return this.prisma.$transaction(async (transaction) => {
      const archivedAt = new Date();
      const archived = await transaction.contractTemplateVersion.updateMany({
        data: { archivedAt, status: TemplateVersionStatus.ARCHIVED },
        where: {
          id: versionId,
          templateId,
          status: TemplateVersionStatus.DRAFT,
        },
      });
      if (archived.count !== 1) throw draftRequired();
      const updated =
        await transaction.contractTemplateVersion.findUniqueOrThrow({
          include: templateVersionInclude,
          where: { id: versionId },
        });
      await recordTemplateAudit(transaction, {
        actorUserId,
        eventType: "ADMIN_TEMPLATE_VERSION_ARCHIVED",
        requestId,
        version: updated,
      });
      return toAdminTemplateVersion(updated);
    });
  }

  async listAiGenerations(): Promise<AdminAiGenerationListResponse> {
    const [generations, total] = await Promise.all([
      this.prisma.aiGeneration.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          attemptCount: true,
          completedAt: true,
          createdAt: true,
          failedAt: true,
          failureCode: true,
          id: true,
          promptId: true,
          promptVersion: true,
          providerMetadata: true,
          queuedAt: true,
          startedAt: true,
          status: true,
          templateVersion: {
            select: {
              template: { select: { title: true } },
              versionNumber: true,
            },
          },
          updatedAt: true,
        },
        take: ADMIN_LIST_LIMIT,
      }),
      this.prisma.aiGeneration.count(),
    ]);

    return {
      items: generations.map((generation) => {
        const metadata = jsonRecord(generation.providerMetadata);
        const usage = jsonRecord(metadata?.usage);
        return {
          attemptCount: generation.attemptCount,
          completedAt: generation.completedAt?.toISOString() ?? null,
          createdAt: generation.createdAt.toISOString(),
          failedAt: generation.failedAt?.toISOString() ?? null,
          failureCode: generation.failureCode,
          id: generation.id,
          model: safeString(metadata?.modelVersion),
          promptId: generation.promptId,
          promptVersion: generation.promptVersion,
          provider: safeString(metadata?.provider),
          queuedAt: generation.queuedAt?.toISOString() ?? null,
          redactedPiiCount: safeNonNegativeInteger(metadata?.redactedPiiCount),
          startedAt: generation.startedAt?.toISOString() ?? null,
          status: generation.status,
          templateTitle: generation.templateVersion.template.title,
          templateVersion: generation.templateVersion.versionNumber,
          totalTokens: safeNonNegativeInteger(usage?.totalTokens),
          updatedAt: generation.updatedAt.toISOString(),
        };
      }),
      total,
    };
  }
}

function toAdminTemplate(template: AdminTemplateRecord): AdminContractTemplate {
  return {
    createdAt: template.createdAt.toISOString(),
    id: template.id,
    isDemo: template.isDemo,
    slug: template.slug,
    summary: template.summary,
    title: template.title,
    updatedAt: template.updatedAt.toISOString(),
    versions: template.versions.map(toAdminTemplateVersion),
  };
}

function toAdminTemplateVersion(
  version: AdminTemplateVersionRecord,
): AdminTemplateVersion {
  return {
    archivedAt: version.archivedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    documentRequirements: version.documentRequirements.map((requirement) => ({
      description: requirement.description,
      id: requirement.id,
      key: requirement.key,
      required: requirement.required,
      sortOrder: requirement.sortOrder,
      title: requirement.title,
    })),
    id: version.id,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    questionnaireSchema: asJsonObject(version.questionnaireSchema),
    status: version.status,
    updatedAt: version.updatedAt.toISOString(),
    versionNumber: version.versionNumber,
  };
}

function assertUniqueRequirementKeys(
  requirements: NonNullable<
    UpdateAdminTemplateVersionRequest["documentRequirements"]
  >,
): void {
  const keys = requirements.map(({ key }) => key.trim());
  if (new Set(keys).size !== keys.length) {
    throw new BadRequestException({
      code: "DOCUMENT_REQUIREMENT_KEY_DUPLICATE",
      message: "Ключи документов в версии не должны повторяться",
    });
  }
}

function assertEditableSchema(
  validator: TemplateSchemaValidator,
  versionId: string,
  schema: Record<string, unknown>,
): void {
  try {
    validator.assertSchema(`admin:${versionId}`, schema);
  } catch {
    throw new BadRequestException({
      code: "TEMPLATE_SCHEMA_INVALID",
      message: "Схема анкеты заполнена некорректно",
    });
  }
}

async function recordTemplateAudit(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    eventType: string;
    requestId?: string;
    version: AdminTemplateVersionRecord;
  },
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      entityId: input.version.id,
      entityType: "ContractTemplateVersion",
      eventType: input.eventType,
      metadata: {
        status: input.version.status,
        templateId: input.version.templateId,
        versionNumber: input.version.versionNumber,
      },
      requestId: input.requestId,
    },
  });
}

function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException({
      code: "TEMPLATE_SCHEMA_INVALID",
      message: "Схема анкеты заполнена некорректно",
    });
  }
  return value;
}

function asInputJsonObject(
  value: Prisma.JsonValue | Record<string, unknown>,
): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length <= 128 ? value : null;
}

function safeNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function normalizeOptionalText(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function templateNotFound(): NotFoundException {
  return new NotFoundException({
    code: "TEMPLATE_NOT_FOUND",
    message: "Шаблон не найден",
  });
}

function versionNotFound(): NotFoundException {
  return new NotFoundException({
    code: "TEMPLATE_VERSION_NOT_FOUND",
    message: "Версия шаблона не найдена",
  });
}

function draftRequired(): ConflictException {
  return new ConflictException({
    code: "TEMPLATE_VERSION_NOT_DRAFT",
    message:
      "Изменять, публиковать и архивировать можно только черновую версию",
  });
}

function displayName(
  profile: {
    firstName: string;
    lastName: string;
    middleName: string | null;
  } | null,
  maxAccount: {
    firstName: string | null;
    lastName: string | null;
  } | null,
): string {
  const values = profile
    ? [profile.lastName, profile.firstName, profile.middleName]
    : [maxAccount?.lastName, maxAccount?.firstName];
  return values.filter(Boolean).join(" ") || "Пользователь MAX";
}
