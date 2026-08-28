import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { readCookie } from "./auth-cookie";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly cookieName: string;

  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    this.cookieName = config.getOrThrow<string>("AUTH_COOKIE_NAME");
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, this.cookieName);

    if (!token) {
      throw new UnauthorizedException({
        code: "AUTH_SESSION_REQUIRED",
        message: "Требуется авторизация",
      });
    }

    request.auth = await this.auth.resolveSession(token);
    return true;
  }
}
