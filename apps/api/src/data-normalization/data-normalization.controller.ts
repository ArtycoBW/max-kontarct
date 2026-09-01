import type {
  AddressSuggestionListResponse,
  NormalizedAddress,
} from "@max-contract/contracts";
import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DataNormalizationService } from "./data-normalization.service";
import {
  NormalizeAddressDto,
  SuggestAddressQueryDto,
} from "./dto/address-normalization.dto";

@Controller("data-normalization")
@UseGuards(SessionAuthGuard)
@ApiTags("data-normalization")
@ApiCookieAuth("max_contract_session")
export class DataNormalizationController {
  constructor(private readonly normalization: DataNormalizationService) {}

  @Get("addresses/suggestions")
  @ApiOperation({ summary: "Получить безопасные подсказки адресов" })
  suggestAddresses(
    @Query() query: SuggestAddressQueryDto,
  ): Promise<AddressSuggestionListResponse> {
    return this.normalization.suggestAddresses(query.query);
  }

  @Post("addresses/normalize")
  @ApiOperation({ summary: "Нормализовать адрес во внутренний формат" })
  normalizeAddress(@Body() body: NormalizeAddressDto): Promise<NormalizedAddress> {
    return this.normalization.normalizeAddress(body.address);
  }
}
