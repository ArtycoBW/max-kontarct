import type {
  DealApprovalResponse,
  DealInvitationResponse,
  DealWorkspaceResponse,
  PublicDealInvitationResponse,
} from "@max-contract/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DealInvitationsService } from "./deal-invitations.service";
import { ApproveDealVersionDto, DealVersionParamsDto } from "./dto/approve-deal-version.dto";
import { CreateDealInvitationDto } from "./dto/create-deal-invitation.dto";
import {
  DealInvitationParamsDto,
  InvitationPublicParamsDto,
} from "./dto/invitation-params.dto";
import { JoinDealInvitationDto } from "./dto/join-deal-invitation.dto";
import { DealParamsDto } from "./dto/deal-params.dto";

@Controller("public/invitations")
@ApiTags("public invitations")
export class PublicDealInvitationsController {
  constructor(private readonly invitations: DealInvitationsService) {}

  @Get(":publicCode")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Получить безопасный публичный предпросмотр приглашения" })
  @ApiOkResponse({ description: "Только разрешённые для публичного показа поля" })
  preview(
    @Param() params: InvitationPublicParamsDto,
  ): Promise<PublicDealInvitationResponse> {
    return this.invitations.publicPreview(params.publicCode);
  }
}

@Controller("deal-invitations")
@UseGuards(SessionAuthGuard)
@ApiCookieAuth("max_contract_session")
@ApiTags("deal invitations")
export class JoinDealInvitationsController {
  constructor(private readonly invitations: DealInvitationsService) {}

  @Post("join")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: "Присоединиться по одноразовому приглашению" })
  @ApiOkResponse({ description: "Контрагент атомарно добавлен в сделку" })
  @ApiConflictResponse({ description: "Приглашение недействительно или использовано" })
  join(
    @Body() body: JoinDealInvitationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealWorkspaceResponse> {
    return this.invitations.join(request.auth.user.id, body);
  }
}

@Controller("deals")
@UseGuards(SessionAuthGuard)
@ApiCookieAuth("max_contract_session")
@ApiTags("deal invitations")
export class DealInvitationsController {
  constructor(private readonly invitations: DealInvitationsService) {}

  @Get(":dealId/workspace")
  @ApiOperation({ summary: "Открыть рабочее пространство участника сделки" })
  workspace(
    @Param() params: DealParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealWorkspaceResponse> {
    return this.invitations.workspace(request.auth.user.id, params.dealId);
  }

  @Get(":dealId/invitation")
  @ApiOperation({ summary: "Получить состояние последнего приглашения" })
  current(
    @Param() params: DealParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealInvitationResponse | null> {
    return this.invitations.getCurrent(request.auth.user.id, params.dealId);
  }

  @Post(":dealId/invitations")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "Выпустить защищённое приглашение" })
  @ApiCreatedResponse({ description: "Секретная ссылка возвращена однократно" })
  create(
    @Param() params: DealParamsDto,
    @Body() body: CreateDealInvitationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealInvitationResponse> {
    return this.invitations.create(request.auth.user.id, params.dealId, body);
  }

  @Post(":dealId/invitations/:invitationId/sent")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Отметить передачу приглашения в MAX" })
  markSent(
    @Param() params: DealInvitationParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealInvitationResponse> {
    return this.invitations.markSent(
      request.auth.user.id,
      params.dealId,
      params.invitationId,
    );
  }

  @Post(":dealId/invitations/:invitationId/revoke")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Отозвать действующее приглашение" })
  revoke(
    @Param() params: DealInvitationParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealInvitationResponse> {
    return this.invitations.revoke(
      request.auth.user.id,
      params.dealId,
      params.invitationId,
    );
  }

  @Post(":dealId/versions/:versionId/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Согласовать конкретную версию условий" })
  approve(
    @Param() params: DealVersionParamsDto,
    @Body() body: ApproveDealVersionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DealApprovalResponse> {
    return this.invitations.approve(
      request.auth.user.id,
      params.dealId,
      params.versionId,
      body,
    );
  }
}
