import { HttpException, HttpStatus } from "@nestjs/common";

export interface MappedApiError {
  code: string;
  details: unknown;
  message: string;
  status: number;
}

const STATUS_DEFAULTS: Record<number, Pick<MappedApiError, "code" | "message">> = {
  [HttpStatus.BAD_REQUEST]: {
    code: "BAD_REQUEST",
    message: "Некорректный запрос",
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: "UNAUTHORIZED",
    message: "Требуется авторизация",
  },
  [HttpStatus.FORBIDDEN]: {
    code: "FORBIDDEN",
    message: "Доступ запрещён",
  },
  [HttpStatus.NOT_FOUND]: {
    code: "NOT_FOUND",
    message: "Ресурс не найден",
  },
  [HttpStatus.CONFLICT]: {
    code: "CONFLICT",
    message: "Конфликт состояния",
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: "TOO_MANY_REQUESTS",
    message: "Слишком много запросов",
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: "SERVICE_UNAVAILABLE",
    message: "Сервис временно недоступен",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultForStatus(status: number): Pick<MappedApiError, "code" | "message"> {
  return (
    STATUS_DEFAULTS[status] ?? {
      code: "HTTP_ERROR",
      message: "Не удалось выполнить запрос",
    }
  );
}

export function mapApiError(exception: unknown): MappedApiError {
  if (!(exception instanceof HttpException)) {
    return {
      code: "INTERNAL_SERVER_ERROR",
      details: null,
      message: "Внутренняя ошибка сервиса",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  const status = exception.getStatus();
  const response = exception.getResponse();
  const fallback = defaultForStatus(status);

  if (typeof response === "string") {
    return {
      ...fallback,
      details: null,
      status,
    };
  }

  if (!isRecord(response)) {
    return {
      ...fallback,
      details: null,
      status,
    };
  }

  const validationMessages = Array.isArray(response.message)
    ? response.message.filter((item): item is string => typeof item === "string")
    : null;

  if (status === Number(HttpStatus.BAD_REQUEST) && validationMessages) {
    return {
      code: "VALIDATION_ERROR",
      details: { errors: validationMessages },
      message: "Ошибка валидации",
      status,
    };
  }

  const domainCode = typeof response.code === "string" ? response.code : null;

  return {
    code: domainCode ?? fallback.code,
    details: domainCode ? (response.details ?? null) : null,
    message:
      domainCode && typeof response.message === "string"
        ? response.message
        : fallback.message,
    status,
  };
}
