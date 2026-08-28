import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  ConsentSource,
  ConsentType,
  PhoneVerificationSource,
  PrismaClient,
} from "@prisma/client";

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
        "max_accounts",
        "user_consents",
        "user_phones",
        "user_profiles",
        "user_sessions",
        "users",
      ]),
    );
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
});
