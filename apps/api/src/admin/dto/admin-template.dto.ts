import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class AdminTemplateDocumentRequirementDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description!: string | null;

  @IsBoolean()
  required!: boolean;

  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder!: number;
}

export class UpdateAdminTemplateVersionDto {
  @IsOptional()
  @IsObject()
  questionnaireSchema?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AdminTemplateDocumentRequirementDto)
  documentRequirements?: AdminTemplateDocumentRequirementDto[];
}
