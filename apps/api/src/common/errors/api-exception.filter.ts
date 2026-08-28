import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";

import { resolveRequestId } from "../http/request-id";
import { mapApiError } from "./api-error.mapper";

type RequestWithId = Request & { id?: string };

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const error = mapApiError(exception);
    const requestId = request.id ?? resolveRequestId(request, response);
    const logContext = {
      code: error.code,
      method: request.method,
      path: request.originalUrl,
      requestId,
      status: error.status,
    };

    if (error.status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error({ ...logContext, err: exception }, error.message);
    } else {
      this.logger.warn(logContext, error.message);
    }

    response.status(error.status).json({
      code: error.code,
      details: error.details,
      message: error.message,
      requestId,
    });
  }
}
