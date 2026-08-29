/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { BadRequestException } from "@nestjs/common";
import { AiGenerationStatus, TemplateVersionStatus } from "@prisma/client";

import { TemplateSchemaValidator } from "../templates/template-schema.validator";
import { AdminService } from "./admin.service";

const now = new Date("2026-08-30T12:00:00.000Z");
const TEMPLATE_ID = "10000000-0000-4000-8000-000000000001";
const VERSION_ID = "20000000-0000-4000-8000-000000000001";
const DRAFT_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("AdminService template management", () => {
  let service: AdminService;
  let prisma: any;
  let published: Record<string, any>;
  let draft: Record<string, any>;

  beforeEach(() => {
    published = version({
      id: VERSION_ID,
      publishedAt: now,
      status: TemplateVersionStatus.PUBLISHED,
      versionNumber: 1,
    });
    draft = version({
      id: DRAFT_ID,
      status: TemplateVersionStatus.DRAFT,
      versionNumber: 2,
    });
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => Promise<unknown>) =>
        callback(prisma)),
      aiGeneration: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            attemptCount: 1,
            completedAt: now,
            createdAt: now,
            failedAt: null,
            failureCode: null,
            id: "30000000-0000-4000-8000-000000000001",
            inputAnswers: { passport: "must-not-leak" },
            promptId: "contract-draft",
            promptVersion: "1.0.0",
            providerMetadata: {
              model: "gpt://folder/yandexgpt-5.1",
              modelVersion: "yandexgpt-5.1",
              provider: "yandex",
              providerRequestId: "must-not-leak",
              redactedPiiCount: 2,
              usage: { totalTokens: 604 },
            },
            queuedAt: now,
            startedAt: now,
            status: AiGenerationStatus.COMPLETED,
            structuredDraft: { title: "must-not-leak" },
            templateVersion: {
              template: { title: "Аренда имущества" },
              versionNumber: 1,
            },
            updatedAt: now,
          },
        ]),
      },
      auditEvent: { create: jest.fn(async () => ({ id: "audit" })) },
      contractTemplate: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [template([published])]),
        findUnique: jest.fn(async () => template([published])),
      },
      contractTemplateVersion: {
        create: jest.fn(async () => draft),
        findFirst: jest.fn(async () => draft),
        findUniqueOrThrow: jest.fn(async () => draft),
        update: jest.fn(async () => draft),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      templateDocumentRequirement: {
        createMany: jest.fn(async () => ({ count: 1 })),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    service = new AdminService(prisma, new TemplateSchemaValidator());
  });

  it("returns all versions and their document requirements", async () => {
    const result = await service.listTemplates();

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      slug: "property-rental",
      versions: [
        {
          documentRequirements: [
            expect.objectContaining({ key: "identity_document" }),
          ],
          status: "PUBLISHED",
          versionNumber: 1,
        },
      ],
    });
  });

  it("creates a draft by cloning the published version and records an audit event", async () => {
    const result = await service.createDraftVersion(
      TEMPLATE_ID,
      USER_ID,
      "request-1",
    );

    expect(result.status).toBe("DRAFT");
    expect(prisma.contractTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TemplateVersionStatus.DRAFT,
          templateId: TEMPLATE_ID,
          versionNumber: 2,
        }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: USER_ID,
          eventType: "ADMIN_TEMPLATE_VERSION_CREATED",
        }),
      }),
    );
  });

  it("rejects duplicate document keys before changing the database", async () => {
    await expect(
      service.updateDraftVersion(
        TEMPLATE_ID,
        DRAFT_ID,
        {
          documentRequirements: [
            requirement("identity_document"),
            requirement("identity_document"),
          ],
        },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("publishes only a valid draft and archives the previous published version", async () => {
    draft = version({
      archivedAt: null,
      id: DRAFT_ID,
      publishedAt: now,
      status: TemplateVersionStatus.PUBLISHED,
      versionNumber: 2,
    });
    prisma.contractTemplateVersion.findFirst.mockResolvedValue(
      version({
        id: DRAFT_ID,
        status: TemplateVersionStatus.DRAFT,
        versionNumber: 2,
      }),
    );
    prisma.contractTemplateVersion.findUniqueOrThrow.mockResolvedValue(draft);

    const result = await service.publishDraftVersion(
      TEMPLATE_ID,
      DRAFT_ID,
      USER_ID,
    );

    expect(result.status).toBe("PUBLISHED");
    expect(prisma.contractTemplateVersion.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { templateId: TEMPLATE_ID, status: TemplateVersionStatus.PUBLISHED },
      }),
    );
    expect(prisma.contractTemplateVersion.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: TemplateVersionStatus.DRAFT }),
      }),
    );
  });

  it("projects only allowlisted AI metadata", async () => {
    const result = await service.listAiGenerations();
    const serialized = JSON.stringify(result);

    expect(result.items[0]).toMatchObject({
      model: "yandexgpt-5.1",
      provider: "yandex",
      redactedPiiCount: 2,
      totalTokens: 604,
    });
    expect(serialized).not.toContain("passport");
    expect(serialized).not.toContain("providerRequestId");
    expect(serialized).not.toContain("must-not-leak");
  });
});

function template(versions: Record<string, any>[]) {
  return {
    createdAt: now,
    id: TEMPLATE_ID,
    isDemo: false,
    slug: "property-rental",
    summary: "Аренда жилого или нежилого помещения",
    title: "Аренда имущества",
    updatedAt: now,
    versions,
  };
}

function version(overrides: Record<string, any> = {}) {
  return {
    archivedAt: null,
    createdAt: now,
    documentRequirements: [
      {
        createdAt: now,
        description: "Паспорт стороны",
        id: "40000000-0000-4000-8000-000000000001",
        key: "identity_document",
        required: true,
        sortOrder: 10,
        templateVersionId: VERSION_ID,
        title: "Документ, удостоверяющий личность",
        updatedAt: now,
      },
    ],
    id: VERSION_ID,
    publishedAt: null,
    questionnaireSchema: {
      additionalProperties: false,
      properties: {
        subject: { minLength: 2, title: "Предмет", type: "string" },
      },
      required: ["subject"],
      type: "object",
    },
    status: TemplateVersionStatus.PUBLISHED,
    templateId: TEMPLATE_ID,
    updatedAt: now,
    versionNumber: 1,
    ...overrides,
  };
}

function requirement(key: string) {
  return {
    description: null,
    key,
    required: true,
    sortOrder: 10,
    title: "Документ",
  };
}
