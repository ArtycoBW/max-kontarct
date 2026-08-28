import type {
  ContractTemplateDetailsResponse,
  ContractTemplateListResponse,
} from "@max-contract/contracts";
import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { SessionAuthGuard } from "../auth/session-auth.guard";
import { TemplateSlugParamsDto } from "./dto/template-slug-params.dto";
import { TemplatesService } from "./templates.service";

@Controller("templates")
@UseGuards(SessionAuthGuard)
@ApiTags("templates")
@ApiCookieAuth("max_contract_session")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

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
}
