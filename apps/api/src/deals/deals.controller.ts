import type {
  CreateDealVersionRequest,
  CreateDealDraftRequest,
  DealDraftResponse,
  DealListResponse,
  DealVersionListResponse,
  StartDealAgreementRequest,
  UpdateDealDraftRequest,
} from "@max-contract/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
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
import { CreateDealVersionDto } from "./dto/create-deal-version.dto";
import { DealParamsDto } from "./dto/deal-params.dto";
import { StartDealAgreementDto } from "./dto/start-deal-agreement.dto";
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

  @Get(":dealId/versions")
  @ApiOperation({ summary: "Получить историю версий условий сделки" })
  @ApiOkResponse({ description: "Версии и состояния привязанных согласований" })
  @ApiNotFoundResponse({ description: "Сделка не найдена или недоступна" })
  versions(
    @Param() params: DealParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealVersionListResponse> {
    return this.deals.listVersions(request.auth.user.id, params.dealId);
  }

  @Post(":dealId/agreement/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Зафиксировать черновик и начать согласование" })
  @ApiOkResponse({ description: "Первая версия условий зафиксирована" })
  @ApiConflictResponse({ description: "Конфликт версии или состояния" })
  @ApiForbiddenResponse({ description: "Действие доступно только инициатору" })
  startAgreement(
    @Param() params: DealParamsDto,
    @Body() body: StartDealAgreementDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealDraftResponse> {
    return this.deals.startAgreement(
      request.auth.user.id,
      params.dealId,
      body satisfies StartDealAgreementRequest,
    );
  }

  @Post(":dealId/versions")
  @ApiOperation({ summary: "Создать новую версию изменённых условий" })
  @ApiCreatedResponse({ description: "Новая неизменяемая версия условий" })
  @ApiConflictResponse({ description: "Конфликт версии, состояния или генерации" })
  @ApiForbiddenResponse({ description: "Действие доступно только инициатору" })
  createVersion(
    @Param() params: DealParamsDto,
    @Body() body: CreateDealVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealDraftResponse> {
    return this.deals.createVersion(
      request.auth.user.id,
      params.dealId,
      body satisfies CreateDealVersionRequest,
    );
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
