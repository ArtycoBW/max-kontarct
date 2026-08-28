const {
  ConsentSource,
  ConsentType,
  PhoneVerificationSource,
  PrismaClient,
  TemplateVersionStatus,
} = require("@prisma/client");

const { ensureDatabaseUrl } = require("./load-database-env.cjs");

ensureDatabaseUrl();

const prisma = new PrismaClient();

const DEV_MAX_USER_ID = "dev-max-user-0001";
const DEV_PHONE = "+70000000000";
const DEV_AUDIT_EVENT_ID = "00000000-0000-4000-8000-000000000023";
const DEMO_TEMPLATE_SLUG = "demo-property-rental";
const DEMO_TEMPLATE_PUBLISHED_AT = new Date("2026-08-28T00:00:00.000Z");

async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed is disabled in production");
  }

  const account = await prisma.maxAccount.upsert({
    where: { maxUserId: DEV_MAX_USER_ID },
    update: {
      firstName: "Тест",
      languageCode: "ru",
      username: "dev_mock_user",
    },
    create: {
      firstName: "Тест",
      languageCode: "ru",
      maxUserId: DEV_MAX_USER_ID,
      username: "dev_mock_user",
      user: { create: {} },
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: account.userId },
    update: {},
    create: {
      firstName: "Тест",
      lastName: "Разработчик",
      locale: "ru-RU",
      timezone: "Europe/Moscow",
      userId: account.userId,
    },
  });

  const occupiedPhone = await prisma.userPhone.findUnique({
    where: { e164: DEV_PHONE },
  });

  if (occupiedPhone && occupiedPhone.userId !== account.userId) {
    throw new Error("Mock phone is already assigned to another development user");
  }

  await prisma.userPhone.upsert({
    where: { e164: DEV_PHONE },
    update: {},
    create: {
      e164: DEV_PHONE,
      isPrimary: true,
      source: PhoneVerificationSource.DEV,
      userId: account.userId,
      verifiedAt: new Date(),
    },
  });

  for (const type of [ConsentType.PERSONAL_DATA, ConsentType.TERMS_OF_USE]) {
    await prisma.userConsent.upsert({
      where: {
        userId_type_documentVersion: {
          documentVersion: "dev-v1",
          type,
          userId: account.userId,
        },
      },
      update: {},
      create: {
        documentVersion: "dev-v1",
        granted: true,
        source: ConsentSource.DEV_SEED,
        type,
        userId: account.userId,
      },
    });
  }

  await prisma.auditEvent.upsert({
    where: { id: DEV_AUDIT_EVENT_ID },
    update: {},
    create: {
      actorUserId: account.userId,
      entityId: account.userId,
      entityType: "User",
      eventType: "DEV_USER_SEEDED",
      id: DEV_AUDIT_EVENT_ID,
      metadata: { fixture: true },
      requestId: "dev-seed",
    },
  });

  await seedDemoTemplate();

  console.log(
    `Development fixtures are ready: ${DEV_MAX_USER_ID}, ${DEMO_TEMPLATE_SLUG}`,
  );
}

async function seedDemoTemplate() {
  const template = await prisma.contractTemplate.upsert({
    where: { slug: DEMO_TEMPLATE_SLUG },
    update: {
      isDemo: true,
      summary: "Демонстрационная анкета для проверки модели и API шаблонов.",
      title: "ДЕМО: аренда имущества",
    },
    create: {
      isDemo: true,
      slug: DEMO_TEMPLATE_SLUG,
      summary: "Демонстрационная анкета для проверки модели и API шаблонов.",
      title: "ДЕМО: аренда имущества",
    },
  });

  const version = await prisma.contractTemplateVersion.upsert({
    where: {
      templateId_versionNumber: {
        templateId: template.id,
        versionNumber: 1,
      },
    },
    update: {
      archivedAt: null,
      publishedAt: DEMO_TEMPLATE_PUBLISHED_AT,
      questionnaireSchema: demoQuestionnaireSchema(),
      status: TemplateVersionStatus.PUBLISHED,
    },
    create: {
      publishedAt: DEMO_TEMPLATE_PUBLISHED_AT,
      questionnaireSchema: demoQuestionnaireSchema(),
      status: TemplateVersionStatus.PUBLISHED,
      templateId: template.id,
      versionNumber: 1,
    },
  });

  const requirements = [
    {
      description: "Демонстрационное требование, не предназначенное для production.",
      key: "identity_document",
      required: true,
      sortOrder: 10,
      title: "ДЕМО: документ, удостоверяющий личность",
    },
    {
      description: "Демонстрационное требование, не предназначенное для production.",
      key: "property_document",
      required: false,
      sortOrder: 20,
      title: "ДЕМО: документ на имущество",
    },
  ];

  for (const requirement of requirements) {
    await prisma.templateDocumentRequirement.upsert({
      where: {
        templateVersionId_key: {
          key: requirement.key,
          templateVersionId: version.id,
        },
      },
      update: requirement,
      create: { ...requirement, templateVersionId: version.id },
    });
  }
}

function demoQuestionnaireSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    properties: {
      paymentAmount: {
        minimum: 0,
        title: "Размер платежа",
        type: "number",
      },
      subject: {
        maxLength: 500,
        minLength: 1,
        title: "Предмет аренды",
        type: "string",
      },
    },
    required: ["subject", "paymentAmount"],
    title: "ДЕМО: параметры аренды имущества",
    type: "object",
  };
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
