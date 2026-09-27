import type { ApproveDealVersionRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsUUID, IsOptional, Matches } from "class-validator";

export class ApproveDealVersionDto implements ApproveDealVersionRequest {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  expectedDealUpdatedAt!: string;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  expectedRequisitesHash?: string;
}

export class DealVersionParamsDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  dealId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  versionId!: string;
}
