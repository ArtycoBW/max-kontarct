import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { mapApiError } from "./api-error.mapper";

describe("mapApiError", () => {
  it("maps validation errors without losing field messages", () => {
    const result = mapApiError(
      new BadRequestException({
        message: ["name must be a string", "name should not be empty"],
      }),
    );

    expect(result).toEqual({
      code: "VALIDATION_ERROR",
      details: {
        errors: ["name must be a string", "name should not be empty"],
      },
      message: "Ошибка валидации",
      status: 400,
    });
  });

  it("preserves explicit domain error payloads", () => {
    const result = mapApiError(
      new ServiceUnavailableException({
        code: "DEPENDENCIES_UNAVAILABLE",
        details: { checks: { redis: { status: "down" } } },
        message: "Сервис временно не готов",
      }),
    );

    expect(result).toMatchObject({
      code: "DEPENDENCIES_UNAVAILABLE",
      message: "Сервис временно не готов",
      status: 503,
    });
  });

  it("uses a safe localized message for framework errors", () => {
    expect(mapApiError(new NotFoundException())).toEqual({
      code: "NOT_FOUND",
      details: null,
      message: "Ресурс не найден",
      status: 404,
    });
  });

  it("does not expose unexpected error details", () => {
    expect(mapApiError(new Error("database password leaked"))).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      details: null,
      message: "Внутренняя ошибка сервиса",
      status: 500,
    });
  });
});
