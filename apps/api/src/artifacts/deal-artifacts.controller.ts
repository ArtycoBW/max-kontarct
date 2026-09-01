import { Controller, Get, Param, ParseUUIDPipe, Req, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { DealArtifactType } from "@prisma/client";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DealArtifactsService } from "./deal-artifacts.service";

@Controller("deals/:dealId/artifacts")
@UseGuards(SessionAuthGuard)
@ApiCookieAuth("max_contract_session")
@ApiTags("deal-artifacts")
export class DealArtifactsController {
  constructor(private readonly artifacts: DealArtifactsService) {}

  @Get("final-pdf")
  @ApiOperation({ summary: "Скачать подписанный PDF после проверки ACL" })
  async finalPdf(
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const result = await this.artifacts.download(request.auth.user.id, dealId, DealArtifactType.FINAL_PDF);
    return new StreamableFile(result.object.body, {
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.artifact.originalName)}`,
      type: result.artifact.mimeType,
    });
  }

  @Get("evidence-package")
  @ApiOperation({ summary: "Скачать технический пакет материалов после проверки ACL" })
  async evidencePackage(
    @Param("dealId", new ParseUUIDPipe()) dealId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const result = await this.artifacts.download(request.auth.user.id, dealId, DealArtifactType.EVIDENCE_ZIP);
    return new StreamableFile(result.object.body, {
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.artifact.originalName)}`,
      type: result.artifact.mimeType,
    });
  }
}
