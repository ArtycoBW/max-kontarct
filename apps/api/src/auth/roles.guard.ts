import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "./auth.types";
import { ROLES_METADATA_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth || !allowedRoles.includes(request.auth.user.role)) {
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Недостаточно прав для этого действия",
      });
    }

    return true;
  }
}
