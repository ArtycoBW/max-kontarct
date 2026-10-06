import type { ContractTemplateDetailsResponse } from "@max-contract/contracts";
import { AiProviderError } from "../ai/ai-provider.error";
import type { AiStructuredRequest, AiStructuredResult } from "../ai/ai-provider";
import { AiService } from "../ai/ai.service";
import { DealIntakeService, extractSupportedAnswers, INDIVIDUAL_WARNING } from "./deal-intake.service";
import { TemplateSchemaValidator } from "./template-schema.validator";
import { TemplatesService } from "./templates.service";

function template(slug = "paid-services"): ContractTemplateDetailsResponse {
  return {
    id: "31000000-0000-4000-8000-000000000002", slug, title: "Оказание услуг", summary: "Услуги", isDemo: false,
    currentVersion: { id: "32000000-0000-4000-8000-000000000002", status: "PUBLISHED", versionNumber: 1, publishedAt: "2026-01-01T00:00:00Z", documentRequirements: [],
      questionnaireSchema: { type: "object", additionalProperties: false, required: ["serviceDescription", "paymentAmount"], properties: {
        serviceDescription: { type: "string", title: "Услуга", minLength: 10, maxLength: 1000 },
        paymentAmount: { type: "number", title: "Стоимость", minimum: 1 },
        completionDate: { type: "string", format: "date", title: "Срок" },
        paymentProcedure: { type: "string", title: "Оплата", enum: ["После оказания услуги", "Предоплата 100%"] },
      } },
    },
  };
}
const validator = new TemplateSchemaValidator();
const field = (key: string, value: string, evidence: string) => ({ key, value, evidence });

describe("deal intake", () => {
  it("accepts typography differences while preserving the original wording", () => {
    const source = "Сделать  презентацию на 10 слайдов";
    expect(extractSupportedAnswers(template(), source, [field("serviceDescription", "сделать презентацию на 10 слайдов", "сделать презентацию на 10 слайдов")], validator).answers)
      .toEqual({ serviceDescription: source });
  });

  it("never accepts an amount extracted from inside a different number", () => {
    expect(extractSupportedAnswers(template(), "Стоимость 15000 рублей", [field("paymentAmount", "5000", "5000 рублей")], validator).answers).toEqual({});
  });

  it("rejects valid enum guesses unsupported by the cited words", () => {
    expect(extractSupportedAnswers(template(), "Цена 15000 рублей", [field("paymentProcedure", "После оказания услуги", "15000 рублей")], validator).answers).toEqual({});
    expect(extractSupportedAnswers(template(), "100% предоплата", [field("paymentProcedure", "Предоплата 100%", "100% предоплата")], validator).answers).toEqual({ paymentProcedure: "Предоплата 100%" });
  });

  it("does not turn silence into a boolean agreement", () => {
    const work = template();
    work.currentVersion.questionnaireSchema = { ...work.currentVersion.questionnaireSchema, properties: { ...work.currentVersion.questionnaireSchema.properties as object, materialsIncluded: { type: "boolean", title: "Материалы" } } };
    expect(extractSupportedAnswers(work, "Цена 15000 рублей", [field("materialsIncluded", "true", "15000 рублей")], validator).answers).toEqual({});
    expect(extractSupportedAnswers(work, "Материалы включены", [field("materialsIncluded", "true", "Материалы включены")], validator).answers).toEqual({ materialsIncluded: true });
    expect(extractSupportedAnswers(work, "Материалы не включены", [field("materialsIncluded", "true", "Материалы не включены")], validator).answers).toEqual({});
  });
  it("extracts only evidenced valid fields, leaving required fields for review", () => {
    const input = "Сделать презентацию за 15 000 рублей до 20 сентября 2099 года";
    expect(extractSupportedAnswers(template(), input, [
      field("paymentAmount", "15000", "15 000 рублей"), field("completionDate", "2099-09-20", "20 сентября 2099 года"),
    ], validator)).toEqual({ answers: { paymentAmount: 15000, completionDate: "2099-09-20" }, discarded: false });
  });

  it.each([
    field("paymentAmount", "25000", "15 000 рублей"),
    field("completionDate", "2099-09-21", "20 сентября 2099 года"),
    field("completionDate", "2099-09-20", "20 сентября"),
    field("paymentAmount", "15000", "Несуществующая цитата"),
    field("passport", "test", "15 000 рублей"),
    field("__proto__", "test", "15 000 рублей"),
    field("paymentProcedure", "Любой способ", "15 000 рублей"),
    field("serviceDescription", "{{PII:PHONE}}", "15 000 рублей"),
  ])("rejects invented, unknown or unsupported values: $key $value", candidate => {
    expect(extractSupportedAnswers(template(), "15 000 рублей до 20 сентября 2099 года", [candidate], validator)).toEqual({ answers: {}, discarded: true });
  });

  it("does not guess between conflicting duplicate fields", () => {
    expect(extractSupportedAnswers(template(), "15 000 рублей или 25 000 рублей", [field("paymentAmount", "15000", "15 000 рублей"), field("paymentAmount", "25000", "25 000 рублей")], validator).answers).toEqual({});
  });

  it("preserves verbatim text rather than a new interpretation", () => {
    const text = "Обмен фотоаппарата без доплаты";
    expect(extractSupportedAnswers(template(), text, [field("serviceDescription", "Безвозмездная передача имущества", text)], validator).answers).toEqual({ serviceDescription: text });
  });

  it("does not duplicate editable dates or amounts inside a frozen description", () => {
    const text = "Консультация по дизайну за 15000 рублей";
    expect(extractSupportedAnswers(template(), text, [field("serviceDescription", text, text), field("paymentAmount", "15000", "15000 рублей")], validator)).toEqual({ answers: { paymentAmount: 15000 }, discarded: true });
  });

  const generateStructured = jest.fn<Promise<AiStructuredResult>, [AiStructuredRequest]>();
  const templates = { listPublished: jest.fn(() => Promise.resolve({ items: [template()], total: 1 })), getPublishedBySlug: jest.fn((slug: string) => Promise.resolve(template(slug))) };
  const service = new DealIntakeService({ generateStructured } as unknown as AiService, templates as unknown as TemplatesService, validator);
  beforeEach(() => jest.clearAllMocks());
  it("uses a real AI request for semantic selection and returns a reviewable proposal", async () => {
    generateStructured.mockResolvedValue({ data: { templateSlug: "paid-services", title: "Презентация", reason: "Подходит для услуги", warnings: [], fields: [field("paymentAmount", "15000", "15 000 рублей")] }, metadata: fakeMetadata });
    const result = await service.suggest("user-1", "Подготовить презентацию за 15 000 рублей");
    expect(result).toMatchObject({ mode: "TEMPLATE", answers: { paymentAmount: 15000 } });
    const request = generateStructured.mock.calls[0]?.[0] as { safetyIdentifier: string; prompt: { id: string } };
    expect(request.safetyIdentifier).toBe("user-1");
    expect(request.prompt.id).toBe("deal-intake");
    expect(generateStructured.mock.calls[1]?.[0]).toMatchObject({ prompt: { id: "deal-intake-fields" }, userData: { candidates: [{ slug: "paid-services" }] } });
  });

  it("recovers the subject with a focused second pass instead of copying an embedded price", async () => {
    const base = { templateSlug: "paid-services", title: "Консультация", reason: "Услуга", warnings: [] };
    const source = "Консультация по дизайну за 15000 рублей";
    generateStructured.mockResolvedValueOnce({ data: { ...base, fields: [field("serviceDescription", source, source), field("paymentAmount", "15000", "15000 рублей")] }, metadata: fakeMetadata });
    generateStructured.mockResolvedValueOnce({ data: { ...base, fields: [field("serviceDescription", "Консультация по дизайну", "Консультация по дизайну")] }, metadata: fakeMetadata });
    expect((await service.suggest("user-1", source)).answers).toEqual({ serviceDescription: "Консультация по дизайну", paymentAmount: 15000 });
  });

  it("keeps evidenced first-pass values when focused extraction is unavailable", async () => {
    generateStructured.mockResolvedValueOnce({ data: { templateSlug: "paid-services", title: "Презентация", reason: "Услуга", warnings: [], fields: [field("paymentAmount", "15000", "15000 рублей")] }, metadata: fakeMetadata });
    generateStructured.mockRejectedValueOnce(new AiProviderError("AI_PROVIDER_TIMEOUT", "timeout"));
    expect((await service.suggest("user-1", "Подготовить презентацию за 15000 рублей")).answers).toEqual({ paymentAmount: 15000 });
  });

  it("fills a single explicitly labelled city if both AI passes omit it", async () => {
    const original = template();
    original.currentVersion.questionnaireSchema = { ...original.currentVersion.questionnaireSchema, properties: { ...original.currentVersion.questionnaireSchema.properties as object, serviceLocation: { type: "string", title: "Место", minLength: 2 } } };
    templates.getPublishedBySlug.mockImplementationOnce(() => Promise.resolve(original));
    generateStructured.mockResolvedValue({ data: { templateSlug: "paid-services", title: "Услуга", reason: "Услуга", warnings: [], fields: [] }, metadata: fakeMetadata });
    expect((await service.suggest("user-1", "Консультация в г. Иркутск")).answers).toEqual({ serviceLocation: "г. Иркутск" });
  });
  it("supports an individual draft without creating/publishing a personal template", async () => {
    generateStructured.mockResolvedValue({ data: { templateSlug: "individual-agreement", title: "Соглашение об обмене", reason: "Нет готового типа", warnings: [], fields: [] }, metadata: fakeMetadata });
    expect(await service.suggest("user-1", "Обмен фотоаппарата на велосипед")).toMatchObject({ mode: "INDIVIDUAL", warnings: [INDIVIDUAL_WARNING] });
  });
  it("replaces internal catalog slugs in all displayed AI prose without changing identifiers", async () => {
    generateStructured.mockResolvedValue({ data: { templateSlug: "paid-services", title: "Договор paid-services", reason: "Подходит тип PAID-SERVICES.", warnings: ["Проверьте paid-services"], fields: [] }, metadata: fakeMetadata });
    const result = await service.suggest("user-1", "Подготовить презентацию");
    expect(result.template.slug).toBe("paid-services");
    expect(result.title).toBe("Договор «Оказание услуг»");
    expect(result.reason).toBe("Подходит тип «Оказание услуг».");
    expect(result.warnings).toEqual(["Проверьте «Оказание услуг»"]);
  });
  it("returns a safe retryable error on provider failure", async () => {
    generateStructured.mockRejectedValue(new AiProviderError("AI_PROVIDER_HTTP_ERROR", "private upstream details"));
    await expect(service.suggest("user-1", "Подготовить презентацию")).rejects.toMatchObject({ response: { code: "DEAL_INTAKE_UNAVAILABLE" } });
  });
  it("rejects blank input before any AI call", async () => {
    await expect(service.suggest("user-1", "   ")).rejects.toMatchObject({ response: { code: "DEAL_DESCRIPTION_INVALID" } });
    expect(generateStructured).not.toHaveBeenCalled();
  });
});

const fakeMetadata: AiStructuredResult["metadata"] = { provider: "fake", model: "fake", modelVersion: "1", promptId: "deal-intake", promptVersion: "1", providerRequestId: null, redactedPiiCount: 0, usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 } };
