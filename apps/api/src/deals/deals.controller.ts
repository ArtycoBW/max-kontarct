import type {
  CreateDealDraftRequest,
  DealDraftResponse,
  DealListResponse,
  UpdateDealDraftRequest,
} from "@max-contract/contracts";
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CreateDealDraftDto } from "./dto/create-deal-draft.dto";
import { DealParamsDto } from "./dto/deal-params.dto";
import { UpdateDealDraftDto } from "./dto/update-deal-draft.dto";
import { DealsService } from "./deals.service";

@Controller("deals")
@UseGuards(SessionAuthGuard)
@ApiTags("deals")
@ApiCookieAuth("max_contract_session")
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  @ApiOperation({ summary: "Получить сделки текущего пользователя" })
  @ApiOkResponse({ description: "Список доступных пользователю сделок" })
  list(@Req() request: AuthenticatedRequest): Promise<DealListResponse> {
    return this.deals.list(request.auth.user.id);
  }

  @Post()
  @ApiOperation({ summary: "Создать серверный черновик сделки" })
  @ApiCreatedResponse({ description: "Черновик и первая версия условий" })
  @ApiConflictResponse({ description: "Профиль инициатора не заполнен" })
  create(
    @Body() body: CreateDealDraftDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealDraftResponse> {
    return this.deals.createDraft(
      request.auth.user.id,
      body satisfies CreateDealDraftRequest,
    );
  }

  @Get(":dealId")
  @ApiOperation({ summary: "Открыть доступный пользователю черновик" })
  @ApiOkResponse({ description: "Черновик с последней версией условий" })
  @ApiNotFoundResponse({ description: "Сделка не найдена или недоступна" })
  get(
    @Param() params: DealParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealDraftResponse> {
    return this.deals.getDraft(request.auth.user.id, params.dealId);
  }

  @Patch(":dealId/draft")
  @ApiOperation({ summary: "Автосохранить данные черновика сделки" })
  @ApiOkResponse({ description: "Актуальная серверная версия черновика" })
  @ApiConflictResponse({ description: "Конфликт версии или состояния" })
  @ApiForbiddenResponse({ description: "Редактирование недоступно" })
  update(
    @Param() params: DealParamsDto,
    @Body() body: UpdateDealDraftDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealDraftResponse> {
    return this.deals.updateDraft(
      request.auth.user.id,
      params.dealId,
      body satisfies UpdateDealDraftRequest,
    );
  }
}
