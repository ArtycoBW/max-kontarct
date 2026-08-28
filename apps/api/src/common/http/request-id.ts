import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._-]{8,128}$/;

function getIncomingRequestId(request: IncomingMessage): string | undefined {
  const value = request.headers[REQUEST_ID_HEADER];

  if (typeof value === "string" && SAFE_REQUEST_ID.test(value)) {
    return value;
  }

  return undefined;
}

export function resolveRequestId(
  request: IncomingMessage,
  response: ServerResponse,
): string {
  const requestId = getIncomingRequestId(request) ?? randomUUID();
  response.setHeader(REQUEST_ID_HEADER, requestId);

  return requestId;
}
