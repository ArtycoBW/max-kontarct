import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SessionAuthGuard } from "../src/auth/session-auth.guard";
import { DealIntakeController } from "../src/templates/deal-intake.controller";
import { DealIntakeService } from "../src/templates/deal-intake.service";

@Injectable()
class TestSession implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.headers["x-test-user"] !== "authenticated") throw new UnauthorizedException();
    req.auth = { user: { id: "owned-user" } };
    return true;
  }
}

describe("deal intake API", () => {
  let app: INestApplication;
  const suggest = jest.fn(async (_user: string, description: string) => ({ description, mode: "TEMPLATE", answers: {} }));
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [DealIntakeController], providers: [{ provide: DealIntakeService, useValue: { suggest } }] })
      .overrideGuard(SessionAuthGuard).useClass(TestSession).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => suggest.mockClear());
  it("requires authentication", async () => {
    await request(app.getHttpServer()).post("/deal-intake").send({ description: "Подготовить презентацию" }).expect(401);
    expect(suggest).not.toHaveBeenCalled();
  });
  it.each([{ description: "  " }, { description: "x".repeat(501) }, { description: 123 }, { description: "Подготовить презентацию", userId: "another-user" }])("validates input and rejects client identity overrides", async body => {
    await request(app.getHttpServer()).post("/deal-intake").set("x-test-user", "authenticated").send(body).expect(400);
    expect(suggest).not.toHaveBeenCalled();
  });
  it("uses the server session identity and trims the description", async () => {
    await request(app.getHttpServer()).post("/deal-intake").set("x-test-user", "authenticated").send({ description: "  Подготовить презентацию  " }).expect(200);
    expect(suggest).toHaveBeenCalledWith("owned-user", "Подготовить презентацию");
  });
});
