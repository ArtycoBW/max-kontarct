import type { DealDocumentsWorkspaceResponse, DealFileResponse } from "@max-contract/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { UploadDealFileDto } from "./dto/upload-deal-file.dto";
import { FilesService } from "./files.service";

@Controller("deals/:dealId/files")
@UseGuards(SessionAuthGuard)
@ApiTags("deal-files")
@ApiCookieAuth("max_contract_session")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @ApiOperation({ summary: "Документы и требования выбранной сделки" })
  getWorkspace(
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealDocumentsWorkspaceResponse> {
    return this.files.getWorkspace(request.auth.user.id, dealId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Загрузить частный документ сделки" })
  upload(
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Body() body: UploadDealFileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealFileResponse> {
    if (!file) {
      throw new BadRequestException({ code: "FILE_REQUIRED", message: "Выберите файл" });
    }
    return this.files.upload(request.auth.user.id, dealId, body, file, request.id);
  }

  @Get(":fileId/content")
  @ApiOperation({ summary: "Скачать файл после серверной проверки доступа" })
  async download(
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const result = await this.files.download(request.auth.user.id, dealId, fileId);
    return new StreamableFile(result.object.body, {
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`,
      type: result.file.mimeType,
    });
  }
}
