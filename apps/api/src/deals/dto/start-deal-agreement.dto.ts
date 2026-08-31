import type { StartDealAgreementRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsUUID } from "class-validator";

export class StartDealAgreementDto implements StartDealAgreementRequest {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  expectedUpdatedAt!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  expectedVersionId!: string;
}
