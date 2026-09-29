import { type CanActivate, type ExecutionContext, type INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { NativeDownloadsController, NativeDownloadsService } from "../src/downloads/native-downloads.module";

const path = "/api/v1/deals/20000000-0000-4000-8000-000000000001/artifacts/final-pdf";
class TestGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (req.headers.authorization !== "test-session") throw new UnauthorizedException();
    req.auth = { user: { id: "user1" }, sessionId: "session1" };
    return true;
  }
}

describe("native downloads HTTP", () => {
  let app: INestApplication;
  const service = { prepare: jest.fn(), redeem: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [NativeDownloadsController], providers: [{ provide: NativeDownloadsService, useValue: service }] })
      .overrideGuard(SessionAuthGuard).useClass(TestGuard).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.resetAllMocks());

  it("requires a session to issue a grant", async () => {
    await request(app.getHttpServer()).post("/api/v1/downloads/prepare").send({ path }).expect(401);
    expect(service.prepare).not.toHaveBeenCalled();
  });
  it("binds issuance to the authenticated session", async () => {
    service.prepare.mockResolvedValue({ url: "https://example.test/download", filename: "test.pdf" });
    await request(app.getHttpServer()).post("/api/v1/downloads/prepare").set("Authorization", "test-session").send({ path }).expect(201).expect("Cache-Control", "no-store");
    expect(service.prepare).toHaveBeenCalledWith("user1", "session1", path);
  });
  it.each(["https://external.test/file", "/api/v1/deals/------------------------------------/artifacts/final-pdf"])("rejects invalid resource %s", async invalidPath => {
    await request(app.getHttpServer()).post("/api/v1/downloads/prepare").set("Authorization", "test-session").send({ path: invalidPath }).expect(400);
    expect(service.prepare).not.toHaveBeenCalled();
  });
  it("streams a capability-authorized file without WebView cookies and disables caching", async () => {
    service.redeem.mockResolvedValue({ object: { body: Buffer.from("test-file") }, filename: "Договор.pdf", mimeType: "application/pdf" });
    const response = await request(app.getHttpServer()).get("/api/v1/downloads/content?ticket=test-grant").expect(200).expect("Cache-Control", "private, no-store").expect("Referrer-Policy", "no-referrer").expect("Content-Type", "application/pdf");
    expect(response.headers["content-disposition"]).toContain(encodeURIComponent("Договор.pdf"));
    expect(response.body.toString()).toBe("test-file");
    expect(service.redeem).toHaveBeenCalledWith("test-grant");
  });
  it("does not expose content for an expired or missing grant", async () => {
    service.redeem.mockRejectedValue(new NotFoundException());
    await request(app.getHttpServer()).get("/api/v1/downloads/content").expect(404);
  });
  it.each([["application/pdf", "pdf"], ["application/zip", "zip"]])("serves %s to the native downloader with an ASCII filename and exact length", async (mimeType, extension) => {
    service.redeem.mockResolvedValue({ object: { body: Buffer.from("test-file") }, filename: `Договор.${extension}`, mimeType });
    const response = await request(app.getHttpServer()).get(`/api/v1/downloads/content/file.${extension}?ticket=test-grant`).expect(200)
      .expect("Content-Type", mimeType).expect("Content-Length", "9").expect("Cache-Control", "private, no-store")
      .expect("Content-Disposition", `attachment; filename="Dogovor.${extension}"`);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(service.redeem).toHaveBeenCalledWith("test-grant");
  });
  it("answers HEAD probes without consuming the grant or returning a body", async () => {
    service.redeem.mockResolvedValue({ object: { body: Buffer.from("test-file") }, filename: "Договор.pdf", mimeType: "application/pdf" });
    const response = await request(app.getHttpServer()).head("/api/v1/downloads/content/file.pdf?ticket=test-grant").expect(200).expect("Content-Length", "9");
    expect(response.text).toBeUndefined();
    await request(app.getHttpServer()).get("/api/v1/downloads/content/file.pdf?ticket=test-grant").expect(200);
  });
  it("does not allow the native path to override the authorized file type", async () => {
    service.redeem.mockResolvedValue({ object: { body: Buffer.from("test-file") }, filename: "Договор.pdf", mimeType: "application/pdf" });
    await request(app.getHttpServer()).get("/api/v1/downloads/content/file.exe?ticket=test-grant").expect(404);
  });
  it("rejects expired native grants even on HEAD probes", async () => {
    service.redeem.mockRejectedValue(new NotFoundException());
    await request(app.getHttpServer()).get("/api/v1/downloads/content/file.pdf?ticket=expired").expect(404);
    await request(app.getHttpServer()).head("/api/v1/downloads/content/file.pdf?ticket=expired").expect(404);
  });
});
