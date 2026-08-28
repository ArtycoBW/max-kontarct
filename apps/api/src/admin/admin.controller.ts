import type {
  AdminAuditListResponse,
  AdminUserListResponse,
} from "@max-contract/contracts";
import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
@ApiTags("admin")
@ApiCookieAuth("max_contract_session")
@ApiForbiddenResponse({ description: "Роль USER не имеет доступа" })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("users")
  @ApiOperation({ summary: "Безопасный список пользователей" })
  @ApiOkResponse({ description: "Список без чувствительных полей" })
  listUsers(): Promise<AdminUserListResponse> {
    return this.admin.listUsers();
  }

  @Get("audit")
  @ApiOperation({ summary: "Безопасное представление журнала аудита" })
  @ApiOkResponse({ description: "События без metadata и PII" })
  listAuditEvents(): Promise<AdminAuditListResponse> {
    return this.admin.listAuditEvents();
  }
}
