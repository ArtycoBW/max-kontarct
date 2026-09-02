// Standalone test harness. Never imported by AppModule or included in dist.
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

if (process.env.NODE_ENV === "production") throw new Error("Browser harness cannot run in production");
const sourceUrl = new URL(process.env.BROWSER_TEST_DATABASE_URL || "postgresql://e2e:e2e_local_only@127.0.0.1:25434/postgres");
if (!["127.0.0.1", "localhost"].includes(sourceUrl.hostname)) throw new Error("Browser test database must use a local endpoint/tunnel");
const databaseName = `max_contract_browser_${randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: testUrl.toString(), API_PORT: "4301",
  AI_PROVIDER: "fake", DATA_NORMALIZATION_PROVIDER: "mock", SMS_PROVIDER: "fake",
  MAX_BOT_TOKEN: "browser-test-bot-token", MAX_WEBHOOK_SECRET: "browser-test-webhook",
  OTP_HMAC_SECRET: "browser-test-otp-secret-not-for-production",
  PUBLIC_WEB_URL: "http://127.0.0.1:4300", CORS_ORIGINS: "http://127.0.0.1:4300",
  AUTH_REDIS_PREFIX: databaseName, CONTRACT_GENERATION_QUEUE_PREFIX: databaseName,
  CONSENT_ELECTRONIC_SIGNATURE_VERSION: "browser-pep-v1", LOG_LEVEL: "error",
  THROTTLE_LIMIT: "2000",
});
require("reflect-metadata");
const { PrismaClient } = require("@prisma/client");
const { Test } = require("@nestjs/testing");
const { AppModule } = require("../../dist/app.module");
const { configureApplication } = require("../../dist/bootstrap/configure-application");
const { RedisService } = require("../../dist/redis/redis.service");
const { STORAGE_SERVICE } = require("../../dist/storage/storage.service");
const { SMS_PROVIDER } = require("../../dist/signing/sms.provider");
const { MaxBotService } = require("../../dist/max-bot/max-bot.service");
const { ContractGenerationQueue } = require("../../dist/templates/contract-generation.queue");
const { ContractGenerationProcessor } = require("../../dist/templates/contract-generation.processor");
const { ContractGenerationsRepository } = require("../../dist/templates/contract-generations.repository");
const { AiService } = require("../../dist/ai/ai.service");
const { PrismaService } = require("../../dist/database/prisma.service");

const values = new Map();
const objects = new Map();
const codes = new Map();
const redis = {
  async ping() {},
  read(key) { const value = values.get(key); if (value && value.until > Date.now()) return value; values.delete(key); return null; },
  async get(key) { return this.read(key)?.value ?? null; },
  async setWithExpiry(key, value, seconds) { values.set(key, { value, until: Date.now() + seconds * 1000 }); },
  async setIfAbsent(key, value, seconds) { if (this.read(key)) return false; await this.setWithExpiry(key, value, seconds); return true; },
  async delete(key) { values.delete(key); },
  async incrementWithExpiry(key, seconds) { const old = this.read(key); const value = Number(old?.value || 0) + 1; values.set(key, { value: String(value), until: old?.until || Date.now() + seconds * 1000 }); return value; },
  async ttl(key) { const value = this.read(key); return value ? Math.ceil((value.until - Date.now()) / 1000) : -2; },
};
const storage = {
  async checkHealth() {}, async ensureBucket() {},
  async putObject(input) { objects.set(input.key, { body: input.body, contentType: input.contentType }); },
  async getObject(key) { const result = objects.get(key); if (!result) throw new Error("Test object missing"); return result; },
  async deleteObject(key) { objects.delete(key); },
};
const admin = new PrismaClient({ datasources: { db: { url: sourceUrl.toString() } } });
let app;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app?.close();
  if (!/^max_contract_browser_[a-f0-9]{32}$/.test(databaseName)) throw new Error("Unexpected test database");
  await admin.$queryRawUnsafe("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", databaseName);
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.$disconnect();
}
async function main() {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", path.resolve(__dirname, "../../prisma/schema.prisma")], { stdio: "pipe", env: process.env });
  let processGeneration;
  const module = await Test.createTestingModule({ imports: [AppModule] })
    // Allow network latency when PostgreSQL is reached through a loopback SSH tunnel.
    .overrideProvider(PrismaService).useFactory({ factory: () => {
      const client = new PrismaClient({ transactionOptions: { timeout: 30_000, maxWait: 10_000 } });
      client.ping = () => client.$queryRaw`SELECT 1`;
      client.onModuleDestroy = () => client.$disconnect();
      return client;
    } })
    .overrideProvider(RedisService).useValue(redis)
    .overrideProvider(STORAGE_SERVICE).useValue(storage)
    .overrideProvider(SMS_PROVIDER).useValue({ async sendOtp(input) { codes.set(input.phone, input.code); return { channel: "FAKE", messageId: randomUUID() }; } })
    .overrideProvider(MaxBotService).useValue({
      async sendUserNotification() { return true; }, async getBotUsername() { return "browser_test_bot"; },
      async createMiniAppDeeplink(payload) { return `https://max.ru/browser_test_bot?startapp=${payload}`; },
    })
    .overrideProvider(ContractGenerationQueue).useValue({ async enqueue(generationId) {
      setImmediate(() => processGeneration(generationId).catch((error) => { console.error(error.name); }));
    } }).compile();
  app = module.createNestApplication({ logger: false });
  configureApplication(app);
  const processor = new ContractGenerationProcessor(app.get(AiService), app.get(ContractGenerationsRepository));
  processGeneration = (generationId) => processor.process({ data: { generationId }, attemptsMade: 0, opts: { attempts: 1 } });
  const prisma = app.get(PrismaService);
  const express = app.getHttpAdapter().getInstance();
  // Control endpoints exist only on this loopback-bound, isolated test server.
  express.get("/_test/otp/:phone", (request, response) => response.json({ code: codes.get(request.params.phone) || null }));
  express.post("/_test/admin/:maxId", async (request, response) => {
    const account = await prisma.maxAccount.findUniqueOrThrow({ where: { maxUserId: request.params.maxId } });
    await prisma.user.update({ where: { id: account.userId }, data: { role: "ADMIN" } });
    response.json({ ok: true });
  });
  await app.listen(4301, "127.0.0.1");
  console.log("BROWSER_TEST_API_READY");
}
process.on("SIGINT", () => void stop().then(() => process.exit(0)));
process.on("SIGTERM", () => void stop().then(() => process.exit(0)));
main().catch(async (error) => { console.error(error.message); await stop(); process.exit(1); });
