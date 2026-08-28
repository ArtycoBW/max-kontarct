import type {
  ContractTemplateDetailsResponse,
  ContractTemplateListItem,
  ContractTemplateListResponse,
  ContractTemplateVersionSummary,
  TemplateVersionSnapshot,
  ValidateTemplateAnswersRequest,
  ValidateTemplateAnswersResponse,
} from "@max-contract/contracts";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { PublishedTemplateListRecord } from "./templates.repository";
import { TemplatesRepository } from "./templates.repository";
import { TemplateSchemaValidator } from "./template-schema.validator";

@Injectable()
export class TemplatesService {
  constructor(
    private readonly templates: TemplatesRepository,
    private readonly schemaValidator: TemplateSchemaValidator,
  ) {}

  async listPublished(): Promise<ContractTemplateListResponse> {
    const templates = await this.templates.findPublishedTemplates();
    const items = templates.map(toListItem);
    return { items, total: items.length };
  }

  async getPublishedBySlug(
    slug: string,
  ): Promise<ContractTemplateDetailsResponse> {
    const template = await this.templates.findPublishedTemplateBySlug(slug);
    if (!template) {
      throw new NotFoundException({
        code: "TEMPLATE_NOT_FOUND",
        message: "Опубликованный шаблон не найден",
      });
    }

    const version = requirePublishedVersion(template.versions[0]);
    const questionnaireSchema = toSchemaObject(version.questionnaireSchema);
    this.schemaValidator.assertSchema(version.id, questionnaireSchema);
    return {
      ...toTemplateBase(template),
      currentVersion: {
        ...toVersionSummary(version),
        documentRequirements: version.documentRequirements,
        questionnaireSchema,
      },
    };
  }

  async validateAnswers(
    slug: string,
    request: ValidateTemplateAnswersRequest,
  ): Promise<ValidateTemplateAnswersResponse> {
    const template = await this.getPublishedBySlug(slug);
    const version = template.currentVersion;

    if (version.id !== request.templateVersionId) {
      throw new ConflictException({
        code: "TEMPLATE_VERSION_CHANGED",
        message: "Версия шаблона изменилась. Обновите анкету",
      });
    }

    const errors = this.schemaValidator.validateAnswers(
      version.id,
      version.questionnaireSchema,
      request.answers,
    );
    if (errors.length > 0) {
      throw new BadRequestException({
        code: "TEMPLATE_ANSWERS_INVALID",
        details: { errors },
        message: "Проверьте заполнение анкеты",
      });
    }

    return {
      answers: request.answers,
      snapshot: toVersionSnapshot(template),
      valid: true,
    };
  }
}

function toVersionSnapshot(
  template: ContractTemplateDetailsResponse,
): TemplateVersionSnapshot {
  return {
    documentRequirements: template.currentVersion.documentRequirements,
    questionnaireSchema: template.currentVersion.questionnaireSchema,
    templateId: template.id,
    templateSlug: template.slug,
    templateTitle: template.title,
    templateVersionId: template.currentVersion.id,
    versionNumber: template.currentVersion.versionNumber,
  };
}

function toListItem(
  template: PublishedTemplateListRecord,
): ContractTemplateListItem {
  return {
    ...toTemplateBase(template),
    currentVersion: toVersionSummary(
      requirePublishedVersion(template.versions[0]),
    ),
  };
}

function toTemplateBase(template: {
  id: string;
  isDemo: boolean;
  slug: string;
  summary: string;
  title: string;
}) {
  return {
    id: template.id,
    isDemo: template.isDemo,
    slug: template.slug,
    summary: template.summary,
    title: template.title,
  };
}

function toVersionSummary(version: {
  id: string;
  publishedAt: Date | null;
  status: "PUBLISHED";
  versionNumber: number;
}): ContractTemplateVersionSummary {
  if (!version.publishedAt) {
    throw templateDataError();
  }
  return {
    id: version.id,
    publishedAt: version.publishedAt.toISOString(),
    status: "PUBLISHED",
    versionNumber: version.versionNumber,
  };
}

function requirePublishedVersion<
  T extends {
    publishedAt: Date | null;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  },
>(version: T | undefined): T & { status: "PUBLISHED" } {
  if (!version || version.status !== "PUBLISHED" || !version.publishedAt) {
    throw templateDataError();
  }
  return version as T & { status: "PUBLISHED" };
}

function toSchemaObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw templateDataError();
  }
  return value;
}

function templateDataError(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: "TEMPLATE_DATA_INVALID",
    message: "Данные опубликованного шаблона повреждены",
  });
}
