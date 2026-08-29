import { IsUUID } from "class-validator";

import { TemplateSlugParamsDto } from "./template-slug-params.dto";

export class AiClarificationParamsDto extends TemplateSlugParamsDto {
  @IsUUID()
  sessionId!: string;
}
