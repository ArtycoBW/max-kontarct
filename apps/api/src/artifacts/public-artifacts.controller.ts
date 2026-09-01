import type { PublicDocumentVerificationResponse } from "@max-contract/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { DealArtifactsService } from "./deal-artifacts.service";

@Controller("public/documents")
@ApiTags("public-document-verification")
export class PublicArtifactsController {
  constructor(private readonly artifacts: DealArtifactsService) {}

  @Get(":publicCode")
  @ApiOperation({ summary: "Проверить итоговый PDF без раскрытия персональных данных" })
  @ApiOkResponse({ description: "Только номер, статус, дата и контрольная сумма" })
  verify(@Param("publicCode") publicCode: string): Promise<PublicDocumentVerificationResponse> {
    return this.artifacts.verifyPublic(publicCode);
  }
}
