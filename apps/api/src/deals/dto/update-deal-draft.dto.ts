import type {
  DealCreationPath,
  DealDraftStep,
  UpdateDealDraftRequest,
} from "@max-contract/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

const draftSteps: DealDraftStep[] = [
  "DESCRIPTION",
  "PARAMETERS",
  "AI_CLARIFICATION",
  "AI_GENERATION",
  "INITIATOR",
];

export class UpdateDealDraftDto implements UpdateDealDraftRequest {
  @ApiPropertyOptional({ additionalProperties: true, type: "object" })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsUUID()
  clarificationSessionId?: string | null;

  @ApiPropertyOptional({ enum: ["TEMPLATE", "AI_ASSISTED"] })
  @IsOptional()
  @IsIn(["TEMPLATE", "AI_ASSISTED"])
  creationPath?: DealCreationPath;

  @ApiPropertyOptional({ enum: draftSteps })
  @IsOptional()
  @IsIn(draftSteps)
  currentStep?: DealDraftStep;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsUUID()
  sourceGenerationId?: string | null;

  @ApiPropertyOptional({ maxLength: 160, minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;
}
