import type { CreateDealInvitationRequest } from "@max-contract/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, IsUUID } from "class-validator";

export class CreateDealInvitationDto implements CreateDealInvitationRequest {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  expectedUpdatedAt!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  expectedVersionId!: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  replaceActive?: boolean;
}
