const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;

type ApiRequestOptions = RequestInit & { timeoutMs?: number };

interface ApiErrorBody {
  code?: string;
  details?: unknown;
  message?: string;
  requestId?: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly requestId?: string;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? "Не удалось выполнить запрос");
    this.name = "ApiError";
    this.code = body.code ?? "HTTP_ERROR";
    this.details = body.details ?? null;
    this.requestId = body.requestId;
    this.status = status;
  }
}

function buildUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return null;
  }

  return response.json();
}

export async function apiRequest<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const isMutation = init.method && !["GET", "HEAD"].includes(init.method.toUpperCase());
  const { timeoutMs = isMutation ? 30_000 : REQUEST_TIMEOUT_MS, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(path), {
      ...requestInit,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...requestInit.headers,
      },
      signal: controller.signal,
    });
    const body = await readJson(response);

    if (!response.ok) {
      throw new ApiError(
        response.status,
        typeof body === "object" && body !== null ? body : {},
      );
    }

    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(504, {
        code: "REQUEST_TIMEOUT",
        message: "Сервис отвечает слишком долго",
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
