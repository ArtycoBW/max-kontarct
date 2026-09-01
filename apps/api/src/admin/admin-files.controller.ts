import type {
  AdminFileReviewItem,
  AdminFileReviewListResponse,
} from "@max-contract/contracts";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { FilesService } from "../files/files.service";
import { ReviewDealFileDto } from "./dto/admin-file-review.dto";

@Controller("admin/files")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT)
@ApiTags("admin-files")
@ApiCookieAuth("max_contract_session")
@ApiForbiddenResponse({ description: "Роль USER не имеет доступа" })
export class AdminFilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @ApiOperation({ summary: "Материалы, разрешённые для ручной проверки" })
  listFiles(): Promise<AdminFileReviewListResponse> {
    return this.files.listForAdmin();
  }

  @Get(":fileId/content")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Скачать материал для ручной проверки" })
  async downloadFile(
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
  ): Promise<StreamableFile> {
    const result = await this.files.adminDownload(fileId);
    return new StreamableFile(result.object.body, {
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`,
      type: result.file.mimeType,
    });
  }

  @Patch(":fileId/review")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Принять или отклонить материал вручную" })
  reviewFile(
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Body() body: ReviewDealFileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminFileReviewItem> {
    return this.files.review(request.auth.user.id, fileId, body, request.id);
  }
}
