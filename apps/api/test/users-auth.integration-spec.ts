import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  AiGenerationStatus,
  ConsentSource,
  ConsentType,
  PhoneVerificationSource,
  PrismaClient,
  TemplateVersionStatus,
} from "@prisma/client";

import { PrismaService } from "../src/database/prisma.service";
import { TemplatesRepository } from "../src/templates/templates.repository";
import { TemplateSchemaValidator } from "../src/templates/template-schema.validator";

const DEFAULT_DATABASE_URL =
  "postgresql://max_contract:max_contract_dev@localhost:5434/max_contract";
const TEST_DATABASE_PREFIX = "max_contract_it_";

function databaseUrl(databaseName: string): string {
  const url = new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}

describe("users/auth database foundation (integration)", () => {
  const testDatabase = `${TEST_DATABASE_PREFIX}${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({
    datasources: { db: { url: databaseUrl("postgres") } },
  });
  let database: PrismaClient;

  beforeAll(async () => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Integration database tests are disabled in production");
    }

    if (!testDatabase.startsWith(TEST_DATABASE_PREFIX)) {
      throw new Error("Refusing to create an unexpected test database");
    }

    await admin.$executeRawUnsafe(`CREATE DATABASE "${testDatabase}"`);

    const apiRoot = path.resolve(__dirname, "..");
    const prismaCli = path.resolve(
      apiRoot,
      "node_modules/prisma/build/index.js",
    );

    execFileSync(
      process.execPath,
      [
        prismaCli,
        "migrate",
        "deploy",
        "--schema",
        path.resolve(apiRoot, "prisma/schema.prisma"),
      ],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl(testDatabase) },
        stdio: "pipe",
      },
    );

    database = new PrismaClient({
      datasources: { db: { url: databaseUrl(testDatabase) } },
    });
    await database.$connect();
  });

  afterAll(async () => {
    await database?.$disconnect();

    if (!testDatabase.startsWith(TEST_DATABASE_PREFIX)) {
      throw new Error("Refusing to drop an unexpected database");
    }

    await admin.$queryRawUnsafe(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      testDatabase,
    );
    await admin.$executeRawUnsafe(`DROP DATABASE "${testDatabase}"`);
    await admin.$disconnect();
  });

  it("deploys the first migration to a newly created empty database", async () => {
    const tables = await database.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    const names = tables.map(({ tablename }) => tablename);

    expect(names).toEqual(
      expect.arrayContaining([
        "_prisma_migrations",
        "audit_events",
        "ai_generations",
        "contract_template_versions",
        "contract_templates",
        "max_accounts",
        "user_consents",
        "user_phones",
        "user_profiles",
        "user_sessions",
        "users",
        "template_document_requirements",
      ]),
    );
  });

  it("publishes the production template catalog with valid questionnaires", async () => {
    const templates = await database.contractTemplate.findMany({
      include: {
        versions: {
          include: { documentRequirements: true },
          where: { status: TemplateVersionStatus.PUBLISHED },
        },
      },
      orderBy: { slug: "asc" },
      where: { isDemo: false },
    });
    const validator = new TemplateSchemaValidator();

    expect(templates.map(({ slug }) => slug)).toEqual([
      "movable-property-sale",
      "paid-services",
      "personal-loan",
      "property-rental",
      "work-contract",
    ]);
    for (const template of templates) {
      expect(template.versions).toHaveLength(1);
      const version = template.versions[0];
      expect(version).toMatchObject({
        status: TemplateVersionStatus.PUBLISHED,
        versionNumber: 1,
      });
      expect(version?.documentRequirements.length).toBeGreaterThan(0);
      validator.assertSchema(
        version?.id ?? "missing-version",
        version?.questionnaireSchema as Record<string, unknown>,
      );
      const schema = version?.questionnaireSchema as Record<string, unknown>;
      expect(schema["x-fieldOrder"]).toEqual(expect.any(Array));
    }
    const propertyRental = templates.find(({ slug }) => slug === "property-rental");
    expect(propertyRental?.versions[0]?.questionnaireSchema).toMatchObject({
      "x-fieldOrder": [
        "propertyDescription",
        "startDate",
        "endDate",
        "paymentAmount",
        "paymentFrequency",
        "depositAmount",
        "utilitiesIncluded",
      ],
      "x-rules": [
        expect.objectContaining({
          endField: "endDate",
          kind: "dateOrder",
          startField: "startDate",
        }),
      ],
    });
    const loan = templates.find(({ slug }) => slug === "personal-loan");
    expect(loan?.versions[0]?.questionnaireSchema).toMatchObject({
      "x-rules": [
        expect.objectContaining({
          dependsOn: "interestType",
          field: "interestRate",
          kind: "requiredWhen",
        }),
      ],
    });
  });

  it("enforces a globally unique MAX user id", async () => {
    const maxUserId = `max-${randomUUID()}`;

    await database.user.create({
      data: { maxAccount: { create: { maxUserId } } },
    });

    await expect(
      database.user.create({
        data: { maxAccount: { create: { maxUserId } } },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("creates one physical-person profile per user", async () => {
    const user = await database.user.create({
      data: {
        profile: {
          create: {
            firstName: "Иван",
            lastName: "Тестовый",
            email: "ivan@example.ru",
            locale: "ru-RU",
            timezone: "Europe/Moscow",
          },
        },
      },
      include: { profile: true },
    });

    expect(user.profile).toMatchObject({
      firstName: "Иван",
      lastName: "Тестовый",
      email: "ivan@example.ru",
      userId: user.id,
    });
  });

  it("persists all supported RBAC roles", async () => {
    const adminUser = await database.user.create({
      data: { role: "ADMIN" },
    });
    const supportUser = await database.user.create({
      data: { role: "SUPPORT" },
    });

    expect(adminUser.role).toBe("ADMIN");
    expect(supportUser.role).toBe("SUPPORT");
  });

  it("stores independent consent document versions", async () => {
    const user = await database.user.create({ data: {} });

    await database.userConsent.createMany({
      data: [
        {
          documentVersion: "2026.01",
          granted: true,
          source: ConsentSource.MINI_APP,
          type: ConsentType.PERSONAL_DATA,
          userId: user.id,
        },
        {
          documentVersion: "2026.02",
          granted: true,
          source: ConsentSource.MINI_APP,
          type: ConsentType.PERSONAL_DATA,
          userId: user.id,
        },
      ],
    });

    const versions = await database.userConsent.findMany({
      orderBy: { documentVersion: "asc" },
      select: { documentVersion: true },
      where: { userId: user.id },
    });

    expect(versions).toEqual([
      { documentVersion: "2026.01" },
      { documentVersion: "2026.02" },
    ]);

    await expect(
      database.userConsent.create({
        data: {
          documentVersion: "2026.02",
          granted: true,
          source: ConsentSource.MINI_APP,
          type: ConsentType.PERSONAL_DATA,
          userId: user.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("stores a verified primary phone and keeps it globally unique", async () => {
    const firstUser = await database.user.create({ data: {} });
    const secondUser = await database.user.create({ data: {} });

    const phone = await database.userPhone.create({
      data: {
        e164: "+79991234567",
        isPrimary: true,
        source: PhoneVerificationSource.MAX,
        userId: firstUser.id,
        verifiedAt: new Date(),
      },
    });

    expect(phone).toMatchObject({
      e164: "+79991234567",
      isPrimary: true,
      source: PhoneVerificationSource.MAX,
      userId: firstUser.id,
    });
    await expect(
      database.userPhone.create({
        data: {
          e164: "+79991234567",
          source: PhoneVerificationSource.MAX,
          userId: secondUser.id,
          verifiedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("inserts an audit event with a nullable safe metadata payload", async () => {
    const user = await database.user.create({ data: {} });
    const event = await database.auditEvent.create({
      data: {
        actorUserId: user.id,
        entityId: user.id,
        entityType: "User",
        eventType: "USER_PROFILE_CREATED",
        metadata: { changedFields: ["firstName", "lastName"] },
        requestId: `integration-${randomUUID()}`,
      },
    });

    expect(event).toMatchObject({
      actorUserId: user.id,
      entityId: user.id,
      entityType: "User",
      eventType: "USER_PROFILE_CREATED",
    });
  });

  it("stores versioned template schemas and version-specific document requirements", async () => {
    const template = await database.contractTemplate.create({
      data: {
        isDemo: true,
        slug: "integration-rental",
        summary: "Демонстрационный шаблон для integration-теста",
        title: "ДЕМО: аренда",
        versions: {
          create: [
            {
              questionnaireSchema: { properties: {}, type: "object" },
              status: TemplateVersionStatus.DRAFT,
              versionNumber: 1,
            },
            {
              documentRequirements: {
                create: {
                  key: "identity_document",
                  required: true,
                  sortOrder: 10,
                  title: "ДЕМО: документ",
                },
              },
              publishedAt: new Date("2026-08-28T12:00:00.000Z"),
              questionnaireSchema: {
                properties: { subject: { type: "string" } },
                type: "object",
              },
              status: TemplateVersionStatus.PUBLISHED,
              versionNumber: 2,
            },
          ],
        },
      },
      include: {
        versions: {
          include: { documentRequirements: true },
          orderBy: { versionNumber: "asc" },
        },
      },
    });

    expect(template.versions).toHaveLength(2);
    expect(template.versions[1]).toMatchObject({
      status: TemplateVersionStatus.PUBLISHED,
      versionNumber: 2,
    });
    expect(template.versions[1]?.documentRequirements).toEqual([
      expect.objectContaining({ key: "identity_document", sortOrder: 10 }),
    ]);

    await database.contractTemplate.create({
      data: {
        slug: "integration-draft-only",
        summary: "Черновик не должен попадать в пользовательский API",
        title: "ДЕМО: только черновик",
        versions: {
          create: {
            questionnaireSchema: { properties: {}, type: "object" },
            versionNumber: 1,
          },
        },
      },
    });

    const repository = new TemplatesRepository(
      database as unknown as PrismaService,
    );
    const published = await repository.findPublishedTemplates();
    const details = await repository.findPublishedTemplateBySlug(
      "integration-rental",
    );

    expect(published.map(({ slug }) => slug)).toContain("integration-rental");
    expect(published.map(({ slug }) => slug)).not.toContain(
      "integration-draft-only",
    );
    expect(details?.versions[0]).toMatchObject({
      status: TemplateVersionStatus.PUBLISHED,
      versionNumber: 2,
    });

    await expect(
      database.contractTemplateVersion.create({
        data: {
          questionnaireSchema: { type: "object" },
          templateId: template.id,
          versionNumber: 2,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("persists an owned AI clarification session with versioned prompt data", async () => {
    const user = await database.user.create({ data: {} });
    const template = await database.contractTemplate.create({
      data: {
        slug: "integration-ai-session",
        summary: "Шаблон для проверки AI-сессии",
        title: "Аренда имущества",
        versions: {
          create: {
            publishedAt: new Date("2026-08-29T12:00:00.000Z"),
            questionnaireSchema: { properties: {}, type: "object" },
            status: TemplateVersionStatus.PUBLISHED,
            versionNumber: 1,
          },
        },
      },
      include: { versions: true },
    });
    const version = template.versions[0];
    if (!version) throw new Error("Expected the published template version");

    const session = await database.aiGeneration.create({
      data: {
        inputAnswers: { paymentAmount: 120_000 },
        promptId: "contract-clarification",
        promptVersion: "1.0.0",
        providerMetadata: { model: "fake-yandexgpt", provider: "fake" },
        questions: [
          {
            description: "Уточнение влияет на расходы.",
            id: "utilitiesPayer",
            label: "Кто оплачивает коммунальные услуги?",
            options: [
              { label: "Арендатор", value: "tenant" },
              { label: "Арендодатель", value: "landlord" },
            ],
            required: true,
            type: "single_choice",
          },
        ],
        status: AiGenerationStatus.NEED_MORE_INFO,
        templateVersionId: version.id,
        userId: user.id,
      },
    });

    expect(session).toMatchObject({
      promptId: "contract-clarification",
      promptVersion: "1.0.0",
      status: AiGenerationStatus.NEED_MORE_INFO,
      templateVersionId: version.id,
      userId: user.id,
    });

    const generated = await database.aiGeneration.update({
      data: {
        attemptCount: 2,
        completedAt: new Date("2026-08-30T00:10:00.000Z"),
        queuedAt: new Date("2026-08-30T00:08:00.000Z"),
        startedAt: new Date("2026-08-30T00:09:00.000Z"),
        status: AiGenerationStatus.COMPLETED,
        structuredDraft: {
          preamble: "Стороны заключили настоящий договор.",
          sections: [
            { clauses: ["Предмет согласован."], heading: "Предмет" },
          ],
          title: "Договор аренды",
          warnings: [],
        },
      },
      where: { id: session.id },
    });

    expect(generated).toMatchObject({
      attemptCount: 2,
      status: AiGenerationStatus.COMPLETED,
      structuredDraft: expect.objectContaining({ title: "Договор аренды" }),
    });
  });

  it("keeps document requirements isolated between unrelated templates", async () => {
    await database.contractTemplate.create({
      data: {
        isDemo: true,
        slug: "integration-animal-sale",
        summary: "Демонстрационная продажа животного",
        title: "ДЕМО: продажа животного",
        versions: {
          create: {
            documentRequirements: {
              create: {
                key: "veterinary_passport",
                required: true,
                sortOrder: 10,
                title: "ДЕМО: ветеринарный паспорт",
              },
            },
            publishedAt: new Date("2026-08-28T12:00:00.000Z"),
            questionnaireSchema: {
              additionalProperties: false,
              properties: {},
              type: "object",
            },
            status: TemplateVersionStatus.PUBLISHED,
            versionNumber: 1,
          },
        },
      },
    });
    await database.contractTemplate.create({
      data: {
        isDemo: true,
        slug: "integration-vehicle-sale",
        summary: "Демонстрационная продажа автомобиля",
        title: "ДЕМО: продажа автомобиля",
        versions: {
          create: {
            documentRequirements: {
              create: [
                {
                  key: "vehicle_passport",
                  required: true,
                  sortOrder: 10,
                  title: "ДЕМО: ПТС",
                },
                {
                  key: "vehicle_registration_certificate",
                  required: true,
                  sortOrder: 20,
                  title: "ДЕМО: СТС",
                },
              ],
            },
            publishedAt: new Date("2026-08-28T12:00:00.000Z"),
            questionnaireSchema: {
              additionalProperties: false,
              properties: {},
              type: "object",
            },
            status: TemplateVersionStatus.PUBLISHED,
            versionNumber: 1,
          },
        },
      },
    });

    const repository = new TemplatesRepository(
      database as unknown as PrismaService,
    );
    const animal = await repository.findPublishedTemplateBySlug(
      "integration-animal-sale",
    );
    const vehicle = await repository.findPublishedTemplateBySlug(
      "integration-vehicle-sale",
    );
    const animalKeys =
      animal?.versions[0]?.documentRequirements.map(({ key }) => key) ?? [];
    const vehicleKeys =
      vehicle?.versions[0]?.documentRequirements.map(({ key }) => key) ?? [];

    expect(animalKeys).toEqual(["veterinary_passport"]);
    expect(animalKeys).not.toEqual(
      expect.arrayContaining([
        "vehicle_passport",
        "vehicle_registration_certificate",
      ]),
    );
    expect(vehicleKeys).toEqual([
      "vehicle_passport",
      "vehicle_registration_certificate",
    ]);
  });

  it("rejects invalid template lifecycle data at the database boundary", async () => {
    const template = await database.contractTemplate.create({
      data: {
        slug: "integration-invalid-lifecycle",
        summary: "Проверка ограничений жизненного цикла",
        title: "ДЕМО: проверка ограничений",
      },
    });

    await expect(
      database.contractTemplateVersion.create({
        data: {
          questionnaireSchema: { type: "object" },
          status: TemplateVersionStatus.PUBLISHED,
          templateId: template.id,
          versionNumber: 1,
        },
      }),
    ).rejects.toBeDefined();
  });
});
