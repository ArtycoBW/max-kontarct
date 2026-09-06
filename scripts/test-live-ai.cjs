// Explicit, paid-provider QA with synthetic fixtures. No database writes or user sessions.
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
if (process.env.RUN_LIVE_AI_QA !== "1") throw new Error("Set RUN_LIVE_AI_QA=1 to authorize live synthetic AI calls");
require("reflect-metadata");
if (process.env.LIVE_QA_ENV_FILE) require("dotenv").config({ path: process.env.LIVE_QA_ENV_FILE, quiet: true });
const root = process.env.LIVE_QA_ROOT || path.resolve(__dirname, "..");
const fromApi = file => require(path.join(root, "apps/api/dist", file));
const { ConfigService } = require("@nestjs/config");
const { PrismaClient } = require("@prisma/client");
const { validateEnvironment } = fromApi("config/environment");
const { YandexAiProvider } = fromApi("ai/yandex-ai.provider");
const { AiOutputValidator } = fromApi("ai/ai-output.validator");
const { PiiRedactor } = fromApi("ai/pii-redactor");
const { AiClarificationsService } = fromApi("templates/ai-clarifications.service");
const { TemplatesService } = fromApi("templates/templates.service");
const { TemplatesRepository } = fromApi("templates/templates.repository");
const { TemplateSchemaValidator } = fromApi("templates/template-schema.validator");
const { ContractGenerationProcessor } = fromApi("templates/contract-generation.processor");
const config = new ConfigService(validateEnvironment(process.env));
if (config.get("AI_PROVIDER") !== "yandex") throw new Error("Live QA requires Yandex, not a fake provider");
const ai = new YandexAiProvider(config, new AiOutputValidator(), new PiiRedactor(), globalThis.fetch.bind(globalThis));
const prisma = new PrismaClient();
const templates = new TemplatesService(new TemplatesRepository(prisma), new TemplateSchemaValidator());
const cases = JSON.parse(fs.readFileSync(process.env.LIVE_QA_FIXTURES || path.join(root, "tests/fixtures/contract-cases.json"), "utf8"))
  .filter(item => !process.env.LIVE_QA_CASE || item.slug === process.env.LIVE_QA_CASE);
const results = [];
async function run() {
  assert(cases.length > 0, "No matching live QA cases");
  for (const item of cases) {
    const template = await templates.getPublishedBySlug(item.slug);
    const records = new Map();
    const userId = randomUUID();
    const repository = {
      async create(input) {
        const record = { id: randomUUID(), userId, templateVersionId: input.templateVersionId, templateVersion: { template: { slug: item.slug, title: item.title }, questionnaireSchema: template.currentVersion.questionnaireSchema, versionNumber: template.currentVersion.versionNumber, documentRequirements: template.currentVersion.documentRequirements }, inputAnswers: input.inputAnswers, questions: input.questions, status: input.status, providerMetadata: input.metadata, clarificationAnswers: null, createdAt: new Date(), updatedAt: new Date() };
        records.set(record.id, record); return record;
      },
      async findOwned(id) { return records.get(id); },
      async update(input) { const record = records.get(input.id); Object.assign(record, { clarificationAnswers: input.answers, questions: input.questions, status: input.status, providerMetadata: input.metadata, updatedAt: new Date() }); return record; },
    };
    const service = new AiClarificationsService(ai, repository, templates);
    const initial = await service.start(item.slug, userId, { answers: item.input, templateVersionId: template.currentVersion.id });
    assert.equal(initial.status, "NEED_MORE_INFO");
    for (const id of Object.keys(item.answers)) assert(initial.questions.some(question => question.id === id), `Missing ${id}`);
    const unexpected = initial.questions.filter(question => !(question.id in item.answers));
    if (unexpected.length) { results.push({ slug: item.slug, unexpected }); console.log(JSON.stringify({ slug: item.slug, unexpectedQuestions: unexpected })); continue; }
    const ready = await service.answer(item.slug, initial.id, userId, { answers: item.answers });
    if (ready.status !== "READY_TO_GENERATE") { results.push({ slug: item.slug, unexpected: ready.questions }); console.log(JSON.stringify({ slug: item.slug, unexpectedQuestions: ready.questions })); continue; }
    const record = records.get(initial.id);
    record.status = "QUEUED";
    let draft;
    const processor = new ContractGenerationProcessor(ai, {
      async findForProcessing() { return record; }, async markGenerating() {},
      async markCompleted(input) { draft = input.draft; },
      async markFailed() { throw new Error(`Generation failed for ${item.slug}`); },
    });
    await processor.process({ data: { generationId: record.id }, attemptsMade: 0, opts: { attempts: 1 } });
    assert(draft?.sections?.length >= 3);
    const completeInput = { ...item.input, [item.completeField]: `${item.input[item.completeField]}. ${Object.values(item.answers).join(". ")}` };
    const complete = await service.start(item.slug, userId, { answers: completeInput, templateVersionId: template.currentVersion.id });
    results.push({ slug: item.slug, questionIds: initial.questions.map(question => question.id), answers: item.answers, input: item.input, draft, completeInputStatus: complete.status, completeInputQuestions: complete.questions });
    console.log(JSON.stringify({ slug: item.slug, requiredQuestions: initial.questions.length, draftSections: draft.sections.length, completeInputStatus: complete.status, completeInputQuestions: complete.questions }));
  }
  const output = path.join(root, "tmp", "stage8-live-ai.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(results, null, 2), { mode: 0o600 });
  console.log(`QA_RESULTS ${output}`);
  if (results.some(item => !item.draft || item.completeInputStatus !== "READY_TO_GENERATE")) process.exitCode = 1;
}
run().catch(error => { console.error(error.name, error.code || error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
