import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  AiGenerationStatus,
  ConsentSource,
  ConsentType,
  DealArtifactType,
  DealPartyRole,
  DealStatus,
  PhoneVerificationSource,
  PrismaClient,
  TemplateVersionStatus,
} from "@prisma/client";

import { PrismaService } from "../src/database/prisma.service";
import { DealStateMachineService } from "../src/deals/deal-state-machine.service";
import { DealsRepository } from "../src/deals/deals.repository";
import { DealsService } from "../src/deals/deals.service";
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
        "deal_approvals",
        "deal_artifacts",
        "deal_files",
        "deal_invitations",
        "deal_parties",
        "deal_signatures",
        "deal_versions",
        "deals",
        "max_accounts",
        "user_consents",
        "user_phones",
        "user_profiles",
        "user_sessions",
        "user_trust_checks",
        "users",
        "template_document_requirements",
      ]),
    );
  });

  it("keeps frozen versions, signatures and final artifacts immutable and unique", async () => {
    const templateVersion = await database.contractTemplateVersion.findFirstOrThrow({
      where: { status: TemplateVersionStatus.PUBLISHED },
    });
    const [initiator, counterparty] = await Promise.all([
      database.user.create({
        data: {
          phones: {
            create: {
              e164: "+79990000001",
              isPrimary: true,
              source: PhoneVerificationSource.MAX,
              verifiedAt: new Date(),
            },
          },
        },
        include: { phones: true },
      }),
      database.user.create({
        data: {
          phones: {
            create: {
              e164: "+79990000002",
              isPrimary: true,
              source: PhoneVerificationSource.MAX,
              verifiedAt: new Date(),
            },
          },
        },
        include: { phones: true },
      }),
    ]);
    const deal = await database.deal.create({
      data: {
        initiatorUserId: initiator.id,
        status: DealStatus.READY_TO_SIGN,
        templateVersionId: templateVersion.id,
        title: "Подписание замороженной версии",
      },
    });
    const [initiatorParty, counterpartyParty] = await Promise.all([
      database.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.INITIATOR,
          userId: initiator.id,
        },
      }),
      database.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.COUNTERPARTY,
          userId: counterparty.id,
        },
      }),
    ]);
    const snapshotHash = "a".repeat(64);
    const version = await database.dealVersion.create({
      data: {
        contractDraft: { sections: [] },
        contractNumber: `МК-IT-${randomUUID()}`,
        createdByUserId: initiator.id,
        dealId: deal.id,
        frozenAt: new Date("2026-09-01T12:00:00.000Z"),
        frozenSnapshot: {
          dealId: deal.id,
          frozenAt: "2026-09-01T12:00:00.000Z",
          parties: [],
          schemaVersion: "deal-signature-v1",
          terms: { amount: 50_000 },
        },
        snapshotHash,
        terms: { amount: 50_000 },
        versionNumber: 1,
      },
    });

    await expect(
      database.dealVersion.update({
        data: { terms: { amount: 60_000 } },
        where: { id: version.id },
      }),
    ).rejects.toBeDefined();

    await database.dealSignature.create({
      data: {
        dealId: deal.id,
        dealVersionId: version.id,
        documentHash: snapshotHash,
        otpChannel: "MAX_TEST",
        partyId: initiatorParty.id,
        pepDocumentVersion: "stage-pep-v1",
        userId: initiator.id,
        verifiedPhoneId: initiator.phones[0]!.id,
      },
    });
    await expect(
      database.dealSignature.create({
        data: {
          dealId: deal.id,
          dealVersionId: version.id,
          documentHash: snapshotHash,
          otpChannel: "MAX_TEST",
          partyId: initiatorParty.id,
          pepDocumentVersion: "stage-pep-v1",
          userId: initiator.id,
          verifiedPhoneId: initiator.phones[0]!.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await database.dealSignature.create({
      data: {
        dealId: deal.id,
        dealVersionId: version.id,
        documentHash: snapshotHash,
        otpChannel: "MAX_TEST",
        partyId: counterpartyParty.id,
        pepDocumentVersion: "stage-pep-v1",
        userId: counterparty.id,
        verifiedPhoneId: counterparty.phones[0]!.id,
      },
    });

    await database.dealArtifact.create({
      data: {
        bucket: "integration",
        dealId: deal.id,
        dealVersionId: version.id,
        mimeType: "application/pdf",
        objectKey: `${deal.id}/final.pdf`,
        originalName: "contract.pdf",
        publicCode: randomUUID().replaceAll("-", ""),
        sha256: "b".repeat(64),
        sizeBytes: 128n,
        type: DealArtifactType.FINAL_PDF,
      },
    });
    await expect(
      database.dealArtifact.create({
        data: {
          bucket: "integration",
          dealId: deal.id,
          dealVersionId: version.id,
          mimeType: "application/pdf",
          objectKey: `${deal.id}/final-copy.pdf`,
          originalName: "contract-copy.pdf",
          sha256: "c".repeat(64),
          sizeBytes: 128n,
          type: DealArtifactType.FINAL_PDF,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces one active invitation and accepts it atomically", async () => {
    const [templateVersion, initiator, counterparty] = await Promise.all([
      database.contractTemplateVersion.findFirstOrThrow({
        where: { status: TemplateVersionStatus.PUBLISHED },
      }),
      database.user.create({ data: {} }),
      database.user.create({ data: {} }),
    ]);
    const deal = await database.deal.create({
      data: {
        initiatorUserId: initiator.id,
        status: DealStatus.INVITED,
        templateVersionId: templateVersion.id,
        title: "Сделка с приглашением",
      },
    });
    await database.dealParty.create({
      data: {
        dealId: deal.id,
        role: DealPartyRole.INITIATOR,
        userId: initiator.id,
      },
    });
    const first = await database.dealInvitation.create({
      data: {
        createdByUserId: initiator.id,
        dealId: deal.id,
        expiresAt: new Date(Date.now() + 60_000),
        publicCode: "FirstCode001",
        tokenHash: "a".repeat(64),
      },
    });

    await expect(
      database.dealInvitation.create({
        data: {
          createdByUserId: initiator.id,
          dealId: deal.id,
          expiresAt: new Date(Date.now() + 60_000),
          publicCode: "SecondCode02",
          tokenHash: "b".repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const accepted = await database.$transaction(async (transaction) => {
      await transaction.dealInvitation.update({
        data: { revokedAt: new Date() },
        where: { id: first.id },
      });
      const invitation = await transaction.dealInvitation.create({
        data: {
          createdByUserId: initiator.id,
          dealId: deal.id,
          expiresAt: new Date(Date.now() + 60_000),
          publicCode: "SecondCode02",
          tokenHash: "b".repeat(64),
        },
      });
      await transaction.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.COUNTERPARTY,
          userId: counterparty.id,
        },
      });
      return transaction.dealInvitation.update({
        data: { acceptedAt: new Date(), acceptedByUserId: counterparty.id },
        where: { id: invitation.id },
      });
    });

    expect(accepted).toMatchObject({
      acceptedByUserId: counterparty.id,
      dealId: deal.id,
      tokenHash: "b".repeat(64),
    });
    await expect(
      database.dealParty.findUniqueOrThrow({
        where: { dealId_role: { dealId: deal.id, role: DealPartyRole.COUNTERPARTY } },
      }),
    ).resolves.toMatchObject({ userId: counterparty.id });
  });

  it("persists versioned deals, parties and approvals with relational boundaries", async () => {
    const [templateVersion, initiator, counterparty, otherUser] = await Promise.all([
      database.contractTemplateVersion.findFirstOrThrow({
        where: { status: TemplateVersionStatus.PUBLISHED },
      }),
      database.user.create({ data: {} }),
      database.user.create({ data: {} }),
      database.user.create({ data: {} }),
    ]);
    const deal = await database.deal.create({
      data: {
        initiatorUserId: initiator.id,
        status: DealStatus.TERMS_REVIEW,
        templateVersionId: templateVersion.id,
        title: "Аренда квартиры",
      },
    });
    const otherDeal = await database.deal.create({
      data: {
        initiatorUserId: otherUser.id,
        templateVersionId: templateVersion.id,
        title: "Другая сделка",
      },
    });
    const [initiatorParty, counterpartyParty, otherParty] = await Promise.all([
      database.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.INITIATOR,
          userId: initiator.id,
        },
      }),
      database.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.COUNTERPARTY,
          userId: counterparty.id,
        },
      }),
      database.dealParty.create({
        data: {
          dealId: otherDeal.id,
          role: DealPartyRole.INITIATOR,
          userId: otherUser.id,
        },
      }),
    ]);
    const version = await database.dealVersion.create({
      data: {
        contractDraft: { sections: [{ clauses: ["Условие"], heading: "Предмет" }] },
        createdByUserId: initiator.id,
        dealId: deal.id,
        terms: { amount: 50_000, subject: "Квартира" },
        versionNumber: 1,
      },
    });
    await database.dealApproval.createMany({
      data: [
        { dealId: deal.id, dealVersionId: version.id, partyId: initiatorParty.id },
        { dealId: deal.id, dealVersionId: version.id, partyId: counterpartyParty.id },
      ],
    });

    const stored = await database.deal.findUniqueOrThrow({
      include: {
        parties: { include: { approvals: true }, orderBy: { role: "asc" } },
        versions: { include: { approvals: true } },
      },
      where: { id: deal.id },
    });

    expect(stored).toMatchObject({
      status: DealStatus.TERMS_REVIEW,
      title: "Аренда квартиры",
      versions: [
        expect.objectContaining({
          terms: { amount: 50_000, subject: "Квартира" },
          versionNumber: 1,
        }),
      ],
    });
    expect(stored.parties).toHaveLength(2);
    expect(stored.versions[0]?.approvals).toHaveLength(2);

    await expect(
      database.dealApproval.create({
        data: {
          dealId: deal.id,
          dealVersionId: version.id,
          partyId: otherParty.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("creates a new deal version atomically and supersedes old approvals", async () => {
    const templateVersion = await database.contractTemplateVersion.findFirstOrThrow({
      where: { status: TemplateVersionStatus.PUBLISHED },
    });
    const [initiator, counterparty] = await Promise.all([
      database.user.create({ data: {} }),
      database.user.create({ data: {} }),
    ]);
    const deal = await database.deal.create({
      data: {
        initiatorUserId: initiator.id,
        status: DealStatus.TERMS_REVIEW,
        templateVersionId: templateVersion.id,
        title: "Аренда квартиры",
      },
    });
    const [initiatorParty, counterpartyParty] = await Promise.all([
      database.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.INITIATOR,
          userId: initiator.id,
        },
      }),
      database.dealParty.create({
        data: {
          dealId: deal.id,
          role: DealPartyRole.COUNTERPARTY,
          userId: counterparty.id,
        },
      }),
    ]);
    const firstVersion = await database.dealVersion.create({
      data: {
        contractDraft: { sections: [{ clauses: ["Сумма 50 000 рублей"] }] },
        createdByUserId: initiator.id,
        dealId: deal.id,
        terms: { amount: 50_000 },
        versionNumber: 1,
      },
    });
    await database.dealApproval.createMany({
      data: [initiatorParty, counterpartyParty].map((party) => ({
        dealId: deal.id,
        dealVersionId: firstVersion.id,
        partyId: party.id,
      })),
    });
    const generation = await database.aiGeneration.create({
      data: {
        attemptCount: 1,
        completedAt: new Date(),
        inputAnswers: { amount: 60_000 },
        promptId: "contract-generation",
        promptVersion: "1",
        providerMetadata: {},
        questions: [],
        status: AiGenerationStatus.COMPLETED,
        structuredDraft: {
          preamble: "Преамбула",
          sections: [{ clauses: ["Сумма 60 000 рублей"] }],
          title: "Договор аренды",
          warnings: [],
        },
        templateVersionId: templateVersion.id,
        userId: initiator.id,
      },
    });
    const repository = new DealsRepository(database as unknown as PrismaService);

    const revised = await repository.createVersion({
      changeSummary: "Изменён размер арендной платы",
      contractDraft: {
        preamble: "Преамбула",
        sections: [{ clauses: ["Сумма 60 000 рублей"] }],
        title: "Договор аренды",
        warnings: [],
      },
      currentStatus: DealStatus.TERMS_REVIEW,
      currentVersionId: firstVersion.id,
      dealId: deal.id,
      expectedUpdatedAt: deal.updatedAt,
      nextStatus: DealStatus.TERMS_REVIEW,
      sourceGenerationId: generation.id,
      terms: { amount: 60_000 },
      userId: initiator.id,
      versionNumber: 2,
    });
    const stored = await database.deal.findUniqueOrThrow({
      include: {
        versions: {
          include: { approvals: true },
          orderBy: { versionNumber: "asc" },
        },
      },
      where: { id: deal.id },
    });

    expect(revised?.versions[0]?.versionNumber).toBe(2);
    expect(stored.versions).toHaveLength(2);
    expect(stored.versions[0]).toMatchObject({
      terms: { amount: 50_000 },
      versionNumber: 1,
    });
    expect(stored.versions[0]?.approvals).toEqual([
      expect.objectContaining({
        invalidatedAt: expect.any(Date),
        status: "SUPERSEDED",
      }),
      expect.objectContaining({
        invalidatedAt: expect.any(Date),
        status: "SUPERSEDED",
      }),
    ]);
    expect(stored.versions[1]).toMatchObject({
      changeSummary: "Изменён размер арендной платы",
      terms: { amount: 60_000 },
      versionNumber: 2,
    });
    expect(
      await database.auditEvent.count({
        where: { entityId: deal.id, eventType: "DEAL_VERSION_CREATED" },
      }),
    ).toBe(1);

    await expect(
      repository.createVersion({
        changeSummary: "Конкурирующая редакция",
        contractDraft: { sections: [] },
        currentStatus: DealStatus.TERMS_REVIEW,
        currentVersionId: firstVersion.id,
        dealId: deal.id,
        expectedUpdatedAt: deal.updatedAt,
        nextStatus: DealStatus.TERMS_REVIEW,
        sourceGenerationId: generation.id,
        terms: { amount: 70_000 },
        userId: initiator.id,
        versionNumber: 2,
      }),
    ).resolves.toBeNull();
  });

  it("creates, autosaves and restores an owned deal draft", async () => {
    const templateVersion = await database.contractTemplateVersion.findFirstOrThrow({
      where: { status: TemplateVersionStatus.PUBLISHED },
    });
    const user = await database.user.create({
      data: {
        maxAccount: {
          create: {
            firstName: "Артур",
            lastName: "Балашев",
            maxUserId: `integration-deal-${randomUUID()}`,
          },
        },
        phones: {
          create: {
            e164: `+79${String(Date.now()).slice(-9)}`,
            isPrimary: true,
            source: PhoneVerificationSource.MAX,
            verifiedAt: new Date(),
          },
        },
        profile: {
          create: {
            email: "deal-owner@example.test",
            firstName: "Артур",
            lastName: "Балашев",
            middleName: "Вадимович",
          },
        },
      },
    });
    const service = new DealsService(
      new DealsRepository(database as unknown as PrismaService),
      new DealStateMachineService(),
    );

    const created = await service.createDraft(user.id, {
      creationPath: "AI_ASSISTED",
      description: "",
      templateVersionId: templateVersion.id,
      title: "Аренда квартиры",
    });
    const saved = await service.updateDraft(user.id, created.id, {
      answers: { paymentAmount: 25_000, propertyDescription: "Квартира" },
      currentStep: "PARAMETERS",
      description: "Аренда квартиры на один календарный месяц",
      expectedUpdatedAt: created.updatedAt,
    });
    const restored = await service.getDraft(user.id, created.id);
    const list = await service.list(user.id);

    expect(saved.versionNumber).toBe(1);
    expect(restored).toMatchObject({
      draft: {
        answers: {
          paymentAmount: 25_000,
          propertyDescription: "Квартира",
        },
        currentStep: "PARAMETERS",
        description: "Аренда квартиры на один календарный месяц",
      },
      id: created.id,
      status: "DRAFT",
    });
    expect(list.items).toEqual([
      expect.objectContaining({ id: created.id, title: "Аренда квартиры" }),
    ]);

    await expect(
      service.updateDraft(user.id, created.id, {
        description: "Устаревшая запись из другой вкладки",
        expectedUpdatedAt: created.updatedAt,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "DEAL_DRAFT_VERSION_CONFLICT" }),
    });
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
