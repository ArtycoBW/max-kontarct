import { RequestMethod } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Params } from "nestjs-pino";

import { resolveRequestId } from "../http/request-id";
import { safeRequestPath } from "./safe-request-path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readProperty(
  request: Record<string, unknown>,
  key: string,
): string | number | undefined {
  const value = request[key];
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

export function createLoggerParams(config: ConfigService): Params {
  return {
    forRoutes: [{ method: RequestMethod.ALL, path: "{*splat}" }],
    pinoHttp: {
      level: config.getOrThrow<string>("LOG_LEVEL"),
      genReqId: resolveRequestId,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
        ],
        censor: "[REDACTED]",
      },
      serializers: {
        req(request: unknown) {
          const value = isRecord(request) ? request : {};
          return {
            id: readProperty(value, "id"),
            method: readProperty(value, "method"),
            url: safeRequestPath(value.url),
          };
        },
      },
    },
  };
}
