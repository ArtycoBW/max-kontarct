import type { JoinDealInvitationRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class JoinDealInvitationDto implements JoinDealInvitationRequest {
  @ApiProperty({ maxLength: 24 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{12}$/)
  publicCode!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32}$/)
  token!: string;
}
