import { ConfigService } from "@nestjs/config";
import { createLoggerParams } from "./logger.config";
import { safeRequestPath } from "./safe-request-path";

describe("request log privacy", () => {
  it("removes query strings and fragments, retaining only the route", () => {
    expect(safeRequestPath("/api/v1/invitations/preview?phone=79991234567&token=secret#proof")).toBe("/api/v1/invitations/preview");
    expect(safeRequestPath(undefined)).toBeUndefined();
  });

  it("serializes a strict request whitelist without credentials or personal data", () => {
    const options = createLoggerParams(new ConfigService({ LOG_LEVEL: "info" })).pinoHttp;
    if (!options || Array.isArray(options) || !("serializers" in options)) throw new Error("Expected logger options");
    const serialized: unknown = options.serializers?.req?.({
      id: "request-123", method: "POST", url: "/api/v1/auth/max?initData=private-proof",
      headers: { authorization: "secret", cookie: "private-session" },
      body: { phone: "+79991234567", code: "4321", lastName: "Персональный" },
    });
    expect(serialized).toEqual({ id: "request-123", method: "POST", url: "/api/v1/auth/max" });
  });
});
