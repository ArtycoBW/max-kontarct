import type {
  ConfirmDealSignatureRequest,
  DealSigningStateResponse,
  IssueSigningOtpRequest,
  IssueSigningOtpResponse,
} from "@max-contract/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConfirmDealSignatureDto, IssueSigningOtpDto, SigningDealParamsDto } from "./dto/signing.dto";
import { SigningService } from "./signing.service";

@Controller("deals")
@UseGuards(SessionAuthGuard)
@ApiCookieAuth("max_contract_session")
@ApiTags("signing")
export class SigningController {
  constructor(private readonly signing: SigningService) {}

  @Get(":dealId/signing")
  @ApiOperation({ summary: "Получить состояние ПЭП для замороженной версии" })
  @ApiOkResponse({ description: "Версия, SHA-256 и подписи обеих сторон" })
  state(@Param() params: SigningDealParamsDto, @Req() request: AuthenticatedRequest): Promise<DealSigningStateResponse> {
    return this.signing.state(request.auth.user.id, params.dealId);
  }

  @Post(":dealId/signing/otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  issueOtp(
    @Param() params: SigningDealParamsDto,
    @Body() body: IssueSigningOtpDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IssueSigningOtpResponse> {
    return this.signing.issueOtp(
      request.auth.user.id,
      params.dealId,
      body satisfies IssueSigningOtpRequest,
      request.id,
    );
  }

  @Post(":dealId/signing/confirm")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(
    @Param() params: SigningDealParamsDto,
    @Body() body: ConfirmDealSignatureDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealSigningStateResponse> {
    return this.signing.confirm(
      request.auth.user.id,
      params.dealId,
      body satisfies ConfirmDealSignatureRequest,
      {
        ipAddress: clientIp(request),
        requestId: request.id,
        userAgent: request.get("user-agent")?.slice(0, 512) ?? null,
      },
    );
  }
}

function clientIp(request: AuthenticatedRequest): string | null {
  const forwarded = request.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.ip;
  return value && value.length <= 64 ? value : null;
}
