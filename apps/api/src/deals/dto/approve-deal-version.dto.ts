import type { ApproveDealVersionRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsUUID } from "class-validator";

export class ApproveDealVersionDto implements ApproveDealVersionRequest {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  expectedDealUpdatedAt!: string;
}

export class DealVersionParamsDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  dealId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  versionId!: string;
}
