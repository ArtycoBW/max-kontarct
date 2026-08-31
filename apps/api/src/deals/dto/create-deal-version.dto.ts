import type { CreateDealVersionRequest } from "@max-contract/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateDealVersionDto implements CreateDealVersionRequest {
  @ApiProperty({ additionalProperties: true, type: "object" })
  @IsObject()
  answers!: Record<string, unknown>;

  @ApiProperty({ maxLength: 500, minLength: 3 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  changeSummary!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsUUID()
  clarificationSessionId?: string | null;

  @ApiProperty({ maxLength: 500, minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  expectedUpdatedAt!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  expectedVersionId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  sourceGenerationId!: string;
}
