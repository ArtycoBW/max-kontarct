import { Equals, IsString, IsUUID, Matches } from "class-validator";

export class SigningDealParamsDto {
  @IsUUID("4")
  dealId!: string;
}

export class IssueSigningOtpDto {
  @Equals(true)
  pepAccepted!: true;

  @IsUUID("4")
  versionId!: string;
}

export class ConfirmDealSignatureDto {
  @IsString()
  @Matches(/^\d{4}$/)
  code!: string;

  @IsUUID("4")
  versionId!: string;
}
