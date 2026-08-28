import type {
  ContractTemplateDetailsResponse,
  ContractTemplateListItem,
  ContractTemplateListResponse,
  ContractTemplateVersionSummary,
} from "@max-contract/contracts";
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { PublishedTemplateListRecord } from "./templates.repository";
import { TemplatesRepository } from "./templates.repository";

@Injectable()
export class TemplatesService {
  constructor(private readonly templates: TemplatesRepository) {}

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
    return {
      ...toTemplateBase(template),
      currentVersion: {
        ...toVersionSummary(version),
        documentRequirements: version.documentRequirements,
        questionnaireSchema: toSchemaObject(version.questionnaireSchema),
      },
    };
  }
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
