import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { TemplateVersionStatus } from "@prisma/client";

import type {
  PublishedTemplateDetailsRecord,
  PublishedTemplateListRecord,
} from "./templates.repository";
import { TemplatesRepository } from "./templates.repository";
import { TemplateSchemaValidator } from "./template-schema.validator";
import { TemplatesService } from "./templates.service";

const publishedAt = new Date("2026-08-28T12:00:00.000Z");

describe("TemplatesService", () => {
  const findPublishedTemplates = jest.fn<
    Promise<PublishedTemplateListRecord[]>,
    []
  >(() => Promise.resolve([]));
  const findPublishedTemplateBySlug = jest.fn<
    Promise<PublishedTemplateDetailsRecord | null>,
    [string]
  >(() => Promise.resolve(null));
  const repository = {
    findPublishedTemplateBySlug,
    findPublishedTemplates,
  } as unknown as TemplatesRepository;
  const service = new TemplatesService(
    repository,
    new TemplateSchemaValidator(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps the latest published version into the list response", async () => {
    findPublishedTemplates.mockResolvedValue([templateListRecord()]);

    await expect(service.listPublished()).resolves.toEqual({
      items: [
        expect.objectContaining({
          currentVersion: {
            id: "20000000-0000-4000-8000-000000000001",
            publishedAt: publishedAt.toISOString(),
            status: "PUBLISHED",
            versionNumber: 2,
          },
          isDemo: true,
          slug: "demo-property-rental",
        }),
      ],
      total: 1,
    });
  });

  it("returns the schema and ordered document requirements", async () => {
    findPublishedTemplateBySlug.mockResolvedValue(templateDetailsRecord());

    const result = await service.getPublishedBySlug("demo-property-rental");

    expect(result.currentVersion.questionnaireSchema).toMatchObject({
      type: "object",
    });
    expect(result.currentVersion.documentRequirements).toEqual([
      expect.objectContaining({ key: "identity_document", sortOrder: 10 }),
    ]);
  });

  it("does not substitute draft data when no published template exists", async () => {
    findPublishedTemplateBySlug.mockResolvedValue(null);

    await expect(
      service.getPublishedBySlug("draft-template"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("validates answers and returns the exact version snapshot", async () => {
    findPublishedTemplateBySlug.mockResolvedValue(templateDetailsRecord());

    await expect(
      service.validateAnswers("demo-property-rental", {
        answers: {},
        templateVersionId: "20000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({
      answers: {},
      snapshot: {
        documentRequirements: [
          expect.objectContaining({ key: "identity_document" }),
        ],
        templateSlug: "demo-property-rental",
        templateVersionId: "20000000-0000-4000-8000-000000000001",
        versionNumber: 2,
      },
      valid: true,
    });
  });

  it("rejects answers for a stale template version", async () => {
    findPublishedTemplateBySlug.mockResolvedValue(templateDetailsRecord());

    await expect(
      service.validateAnswers("demo-property-rental", {
        answers: {},
        templateVersionId: "20000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects answers that do not match the questionnaire", async () => {
    const details = templateDetailsRecord();
    const version = details.versions[0];
    if (!version) {
      throw new Error("Test fixture must contain a published version");
    }
    findPublishedTemplateBySlug.mockResolvedValue({
      ...details,
      versions: [
        {
          ...version,
          questionnaireSchema: {
            additionalProperties: false,
            properties: {
              subject: { minLength: 1, title: "Предмет", type: "string" },
            },
            required: ["subject"],
            type: "object",
          },
        },
      ],
    });

    await expect(
      service.validateAnswers("demo-property-rental", {
        answers: {},
        templateVersionId: "20000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function templateListRecord(): PublishedTemplateListRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    isDemo: true,
    slug: "demo-property-rental",
    summary: "Демонстрационный шаблон",
    title: "ДЕМО: аренда имущества",
    versions: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        publishedAt,
        status: TemplateVersionStatus.PUBLISHED,
        versionNumber: 2,
      },
    ],
  };
}

function templateDetailsRecord(): PublishedTemplateDetailsRecord {
  return {
    ...templateListRecord(),
    versions: [
      {
        documentRequirements: [
          {
            description: null,
            id: "30000000-0000-4000-8000-000000000001",
            key: "identity_document",
            required: true,
            sortOrder: 10,
            title: "ДЕМО: документ",
          },
        ],
        id: "20000000-0000-4000-8000-000000000001",
        publishedAt,
        questionnaireSchema: {
          additionalProperties: false,
          properties: {},
          type: "object",
        },
        status: TemplateVersionStatus.PUBLISHED,
        versionNumber: 2,
      },
    ],
  };
}
