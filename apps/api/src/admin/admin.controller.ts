import type {
  AdminAiGenerationListResponse,
  AdminAuditListResponse,
  AdminTemplateListResponse,
  AdminTemplateVersion,
  AdminUserListResponse,
} from "@max-contract/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
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
import type { AuthenticatedRequest } from "../auth/auth.types";
import { UpdateAdminTemplateVersionDto } from "./dto/admin-template.dto";
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

  @Get("templates")
  @ApiOperation({ summary: "Шаблоны и все их версии" })
  @ApiOkResponse({ description: "Версии, статусы и требования к документам" })
  listTemplates(): Promise<AdminTemplateListResponse> {
    return this.admin.listTemplates();
  }

  @Post("templates/:templateId/versions")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Создать черновую версию из опубликованной" })
  createDraftVersion(
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminTemplateVersion> {
    return this.admin.createDraftVersion(
      templateId,
      request.auth.user.id,
      request.id,
    );
  }

  @Patch("templates/:templateId/versions/:versionId")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Обновить черновую версию шаблона" })
  updateDraftVersion(
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() input: UpdateAdminTemplateVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminTemplateVersion> {
    return this.admin.updateDraftVersion(
      templateId,
      versionId,
      input,
      request.auth.user.id,
      request.id,
    );
  }

  @Post("templates/:templateId/versions/:versionId/publish")
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Опубликовать черновую версию" })
  publishDraftVersion(
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminTemplateVersion> {
    return this.admin.publishDraftVersion(
      templateId,
      versionId,
      request.auth.user.id,
      request.id,
    );
  }

  @Post("templates/:templateId/versions/:versionId/archive")
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Архивировать черновую версию" })
  archiveDraftVersion(
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminTemplateVersion> {
    return this.admin.archiveDraftVersion(
      templateId,
      versionId,
      request.auth.user.id,
      request.id,
    );
  }

  @Get("ai-generations")
  @ApiOperation({ summary: "Безопасные метаданные AI-генераций" })
  @ApiOkResponse({ description: "Без ответов анкеты и текста договора" })
  listAiGenerations(): Promise<AdminAiGenerationListResponse> {
    return this.admin.listAiGenerations();
  }
}
