import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, Matches } from "class-validator";

export class InvitationPublicParamsDto {
  @ApiProperty({ maxLength: 24 })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{12}$/)
  publicCode!: string;
}

export class DealInvitationParamsDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  dealId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  invitationId!: string;
}
