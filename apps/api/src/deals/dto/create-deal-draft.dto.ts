import type {
  CreateDealDraftRequest,
  DealCreationPath,
} from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateDealDraftDto implements CreateDealDraftRequest {
  @ApiProperty({ enum: ["TEMPLATE", "AI_ASSISTED"] })
  @IsIn(["TEMPLATE", "AI_ASSISTED"])
  creationPath!: DealCreationPath;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  templateVersionId!: string;

  @ApiProperty({ maxLength: 160, minLength: 1 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;
}
