import type {
  AiClarificationSessionResponse,
  AnswerAiClarificationRequest,
  ContractTemplateDetailsResponse,
  ContractTemplateListResponse,
  ContractGenerationResponse,
  StartAiClarificationRequest,
  ValidateTemplateAnswersResponse,
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
  ApiBadRequestResponse,
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { AiClarificationsService } from "./ai-clarifications.service";
import { ContractGenerationsService } from "./contract-generations.service";
import { AiClarificationParamsDto } from "./dto/ai-clarification-params.dto";
import { AnswerAiClarificationDto } from "./dto/answer-ai-clarification.dto";
import { StartAiClarificationDto } from "./dto/start-ai-clarification.dto";
import { TemplateSlugParamsDto } from "./dto/template-slug-params.dto";
import { ValidateTemplateAnswersDto } from "./dto/validate-template-answers.dto";
import { TemplatesService } from "./templates.service";

@Controller("templates")
@UseGuards(SessionAuthGuard)
@ApiTags("templates")
@ApiCookieAuth("max_contract_session")
export class TemplatesController {
  constructor(
    private readonly clarifications: AiClarificationsService,
    private readonly generations: ContractGenerationsService,
    private readonly templates: TemplatesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Получить опубликованные шаблоны договоров" })
  @ApiOkResponse({ description: "Список последних опубликованных версий" })
  list(): Promise<ContractTemplateListResponse> {
    return this.templates.listPublished();
  }

  @Get(":slug")
  @ApiOperation({ summary: "Получить опубликованный шаблон по идентификатору" })
  @ApiParam({ name: "slug", example: "demo-property-rental" })
  @ApiOkResponse({ description: "Анкета и требования к документам" })
  @ApiNotFoundResponse({ description: "Опубликованный шаблон не найден" })
  details(
    @Param() params: TemplateSlugParamsDto,
  ): Promise<ContractTemplateDetailsResponse> {
    return this.templates.getPublishedBySlug(params.slug);
  }

  @Post(":slug/validate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Проверить ответы по версии шаблона" })
  @ApiParam({ name: "slug", example: "demo-property-rental" })
  @ApiOkResponse({ description: "Проверенные ответы и снимок версии шаблона" })
  @ApiBadRequestResponse({ description: "Ответы не соответствуют анкете" })
  @ApiConflictResponse({ description: "Опубликованная версия изменилась" })
  validate(
    @Param() params: TemplateSlugParamsDto,
    @Body() body: ValidateTemplateAnswersDto,
  ): Promise<ValidateTemplateAnswersResponse> {
    return this.templates.validateAnswers(params.slug, body);
  }

  @Post(":slug/clarifications")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Начать сессию уточняющих вопросов YandexGPT" })
  @ApiOkResponse({ description: "Статус готовности и типизированные вопросы" })
  startClarification(
    @Param() params: TemplateSlugParamsDto,
    @Body() body: StartAiClarificationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiClarificationSessionResponse> {
    return this.clarifications.start(
      params.slug,
      request.auth.user.id,
      body satisfies StartAiClarificationRequest,
    );
  }

  @Post(":slug/clarifications/:sessionId/answers")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Сохранить ответы на уточняющие вопросы" })
  @ApiOkResponse({ description: "Обновлённый статус AI-сессии" })
  answerClarification(
    @Param() params: AiClarificationParamsDto,
    @Body() body: AnswerAiClarificationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiClarificationSessionResponse> {
    return this.clarifications.answer(
      params.slug,
      params.sessionId,
      request.auth.user.id,
      body satisfies AnswerAiClarificationRequest,
    );
  }

  @Get(":slug/clarifications/:sessionId")
  @ApiOperation({ summary: "Восстановить сессию уточняющих вопросов" })
  @ApiOkResponse({ description: "Текущие вопросы и сохранённые ответы" })
  @ApiNotFoundResponse({ description: "Сессия не найдена или недоступна" })
  clarification(
    @Param() params: AiClarificationParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AiClarificationSessionResponse> {
    return this.clarifications.get(
      params.slug,
      params.sessionId,
      request.auth.user.id,
    );
  }

  @Post(":slug/clarifications/:sessionId/generation")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Запустить фоновую подготовку проекта договора" })
  @ApiAcceptedResponse({ description: "Задача поставлена в очередь" })
  startGeneration(
    @Param() params: AiClarificationParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ContractGenerationResponse> {
    return this.generations.start(
      params.slug,
      params.sessionId,
      request.auth.user.id,
    );
  }

  @Get(":slug/clarifications/:sessionId/generation")
  @ApiOperation({ summary: "Получить статус подготовки проекта договора" })
  @ApiOkResponse({ description: "Статус, прогресс и готовый проект" })
  generation(
    @Param() params: AiClarificationParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ContractGenerationResponse> {
    return this.generations.get(
      params.slug,
      params.sessionId,
      request.auth.user.id,
    );
  }
}
