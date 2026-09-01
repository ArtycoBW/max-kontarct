import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Injectable, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";

import { AdminFilesController } from "../src/admin/admin-files.controller";
import { RolesGuard } from "../src/auth/roles.guard";
import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { API_PREFIX } from "../src/bootstrap/configure-application";
import { FilesService } from "../src/files/files.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const FILE_ID = "30000000-0000-4000-8000-000000000001";

@Injectable()
class TestSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestValue = context.switchToHttp().getRequest();
    const header = requestValue.headers["x-test-role"];
    const role = Object.values(UserRole).includes(header) ? header : UserRole.USER;
    requestValue.auth = { user: { id: USER_ID, role } };
    requestValue.id = "request-files-e2e";
    return true;
  }
}

describe("admin file review RBAC (e2e)", () => {
  let app: INestApplication;
  const listForAdmin = jest.fn(async () => ({ items: [], total: 0 }));
  const review = jest.fn(async () => ({ id: FILE_ID, reviewStatus: "ACCEPTED" }));
  const adminDownload = jest.fn(async () => ({
    file: { mimeType: "application/pdf", originalName: "document.pdf" },
    object: { body: Buffer.from("%PDF-"), contentType: "application/pdf" },
  }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminFilesController],
      providers: [
        RolesGuard,
        Reflector,
        { provide: FilesService, useValue: { adminDownload, listForAdmin, review } },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useClass(TestSessionGuard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it("allows support to inspect safe file metadata only", async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/files`)
      .set("x-test-role", UserRole.SUPPORT)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/files/${FILE_ID}/content`)
      .set("x-test-role", UserRole.SUPPORT)
      .expect(403);
    expect(listForAdmin).toHaveBeenCalledTimes(1);
    expect(adminDownload).not.toHaveBeenCalled();
  });

  it("blocks ordinary users from the review queue", async () => {
    await request(app.getHttpServer())
      .get(`/${API_PREFIX}/admin/files`)
      .set("x-test-role", UserRole.USER)
      .expect(403);
  });

  it("allows only an administrator to record a review decision", async () => {
    await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/admin/files/${FILE_ID}/review`)
      .set("x-test-role", UserRole.ADMIN)
      .send({ comment: null, status: "ACCEPTED" })
      .expect(200);
    expect(review).toHaveBeenCalledWith(
      USER_ID,
      FILE_ID,
      { comment: null, status: "ACCEPTED" },
      "request-files-e2e",
    );
  });

  it("rejects unsupported review statuses before the service", async () => {
    await request(app.getHttpServer())
      .patch(`/${API_PREFIX}/admin/files/${FILE_ID}/review`)
      .set("x-test-role", UserRole.ADMIN)
      .send({ comment: null, status: "PENDING" })
      .expect(400);
    expect(review).not.toHaveBeenCalled();
  });
});
