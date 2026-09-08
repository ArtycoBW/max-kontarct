import type { DealIntakeRequest, DealIntakeResponse } from "@max-contract/contracts";
import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { DealIntakeService } from "./deal-intake.service";

export class DealIntakeDto implements DealIntakeRequest {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @Length(10, 500)
  description!: string;
}

@Controller("deal-intake")
@UseGuards(SessionAuthGuard)
@ApiTags("templates")
@ApiCookieAuth("max_contract_session")
export class DealIntakeController {
  constructor(private readonly intake: DealIntakeService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: "Подобрать договор и извлечь условия из свободного описания" })
  suggest(@Body() body: DealIntakeDto, @Req() request: AuthenticatedRequest): Promise<DealIntakeResponse> {
    return this.intake.suggest(request.auth.user.id, body.description);
  }
}
