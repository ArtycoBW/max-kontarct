import type { UserTrustStatusResponse } from "@max-contract/contracts";
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { TrustService } from "./trust.service";

@Controller("trust")
@UseGuards(SessionAuthGuard)
@ApiTags("trust")
@ApiCookieAuth("max_contract_session")
export class TrustController {
  constructor(private readonly trust: TrustService) {}

  @Get("status")
  @ApiOperation({ summary: "Независимые уровни доверия текущего пользователя" })
  getStatus(@Req() request: AuthenticatedRequest): Promise<UserTrustStatusResponse> {
    return this.trust.getStatus(request.auth.user.id);
  }
}
