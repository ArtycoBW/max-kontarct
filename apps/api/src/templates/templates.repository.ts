import { Injectable } from "@nestjs/common";
import { Prisma, TemplateVersionStatus } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

const versionSummarySelect = {
  id: true,
  publishedAt: true,
  status: true,
  versionNumber: true,
} satisfies Prisma.ContractTemplateVersionSelect;

const templateListSelect = {
  id: true,
  isDemo: true,
  slug: true,
  summary: true,
  title: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: versionSummarySelect,
    take: 1,
    where: { status: TemplateVersionStatus.PUBLISHED },
  },
} satisfies Prisma.ContractTemplateSelect;

const templateDetailsSelect = {
  id: true,
  isDemo: true,
  slug: true,
  summary: true,
  title: true,
  versions: {
    orderBy: { versionNumber: "desc" as const },
    select: {
      ...versionSummarySelect,
      documentRequirements: {
        orderBy: [{ sortOrder: "asc" as const }, { key: "asc" as const }],
        select: {
          description: true,
          id: true,
          key: true,
          required: true,
          sortOrder: true,
          title: true,
        },
      },
      questionnaireSchema: true,
    },
    take: 1,
    where: { status: TemplateVersionStatus.PUBLISHED },
  },
} satisfies Prisma.ContractTemplateSelect;

export type PublishedTemplateListRecord = Prisma.ContractTemplateGetPayload<{
  select: typeof templateListSelect;
}>;

export type PublishedTemplateDetailsRecord = Prisma.ContractTemplateGetPayload<{
  select: typeof templateDetailsSelect;
}>;

@Injectable()
export class TemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublishedTemplates(): Promise<PublishedTemplateListRecord[]> {
    return this.prisma.contractTemplate.findMany({
      orderBy: [{ isDemo: "asc" }, { title: "asc" }],
      select: templateListSelect,
      where: {
        versions: { some: { status: TemplateVersionStatus.PUBLISHED } },
      },
    });
  }

  findPublishedTemplateBySlug(
    slug: string,
  ): Promise<PublishedTemplateDetailsRecord | null> {
    return this.prisma.contractTemplate.findFirst({
      select: templateDetailsSelect,
      where: {
        slug,
        versions: { some: { status: TemplateVersionStatus.PUBLISHED } },
      },
    });
  }
}
