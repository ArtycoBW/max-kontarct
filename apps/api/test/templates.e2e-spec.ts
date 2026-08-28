import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TemplateVersionStatus } from "@prisma/client";
import request from "supertest";

import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { API_PREFIX } from "../src/bootstrap/configure-application";
import { TemplatesController } from "../src/templates/templates.controller";
import type {
  PublishedTemplateDetailsRecord,
  PublishedTemplateListRecord,
} from "../src/templates/templates.repository";
import { TemplatesRepository } from "../src/templates/templates.repository";
import { TemplateSchemaValidator } from "../src/templates/template-schema.validator";
import { TemplatesService } from "../src/templates/templates.service";

const publishedAt = new Date("2026-08-28T12:00:00.000Z");

@Injectable()
class TestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().auth = {
      user: { id: "00000000-0000-4000-8000-000000000001", role: "USER" },
    };
    return true;
  }
}

describe("templates API (e2e)", () => {
  let app: INestApplication;
  const findPublishedTemplates = jest.fn(
    async (): Promise<PublishedTemplateListRecord[]> => [listRecord()],
  );
  const findPublishedTemplateBySlug = jest.fn(
    async (slug: string): Promise<PublishedTemplateDetailsRecord | null> =>
      slug === "demo-property-rental" ? detailsRecord() : null,
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        TemplatesService,
        TemplateSchemaValidator,
        {
          provide: TemplatesRepository,
          useValue: {
            findPublishedTemplateBySlug,
            findPublishedTemplates,
          },
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(TestSessionGuard)
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("lists published templates without the questionnaire payload", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/templates`)
      .expect(200);

    expect(response.body).toMatchObject({
      items: [
        {
          currentVersion: { status: "PUBLISHED", versionNumber: 1 },
          isDemo: true,
          slug: "demo-property-rental",
        },
      ],
      total: 1,
    });
    expect(response.body.items[0].currentVersion).not.toHaveProperty(
      "questionnaireSchema",
    );
  });

  it("returns the published template details", async () => {
    const response = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/templates/demo-property-rental`)
      .expect(200);

    expect(response.body.currentVersion).toMatchObject({
      documentRequirements: [
        expect.objectContaining({ key: "identity_document" }),
      ],
      questionnaireSchema: {
        additionalProperties: false,
        properties: {},
        type: "object",
      },
    });
  });

  it("returns 404 instead of exposing a non-published template", async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/templates/draft-template`)
      .expect(404);
  });

  it("validates answers and returns the version snapshot", async () => {
    const response = await request(app.getHttpServer())
      .post(`/${API_PREFIX}/templates/demo-property-rental/validate`)
      .send({
        answers: {},
        templateVersionId: "20000000-0000-4000-8000-000000000001",
      })
      .expect(200);

    expect(response.body).toMatchObject({
      answers: {},
      snapshot: {
        documentRequirements: [
          expect.objectContaining({ key: "identity_document" }),
        ],
        templateSlug: "demo-property-rental",
        templateVersionId: "20000000-0000-4000-8000-000000000001",
        versionNumber: 1,
      },
      valid: true,
    });
  });

  it("does not accept fields absent from the selected version", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/templates/demo-property-rental/validate`)
      .send({
        answers: { vehicleRegistrationCertificate: "СТС" },
        templateVersionId: "20000000-0000-4000-8000-000000000001",
      })
      .expect(400);
  });

  it("rejects validation after the published version changes", async () => {
    await request(app.getHttpServer())
      .post(`/${API_PREFIX}/templates/demo-property-rental/validate`)
      .send({
        answers: {},
        templateVersionId: "20000000-0000-4000-8000-000000000099",
      })
      .expect(409);
  });

  it("validates the stable template identifier", async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/templates/INVALID%20SLUG`)
      .expect(400);
  });
});

function listRecord(): PublishedTemplateListRecord {
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
        versionNumber: 1,
      },
    ],
  };
}

function detailsRecord(): PublishedTemplateDetailsRecord {
  return {
    ...listRecord(),
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
        versionNumber: 1,
      },
    ],
  };
}
