import { IsString, Matches, MaxLength } from "class-validator";

export class TemplateSlugParamsDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Некорректный идентификатор шаблона",
  })
  slug!: string;
}
