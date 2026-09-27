import type { ContractStructuredDraft, EditContractVersionRequest } from "@max-contract/contracts";
import { IsDateString, IsObject, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class EditContractVersionDto implements EditContractVersionRequest {
  @IsObject()
  contractDraft!: ContractStructuredDraft;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  changeSummary!: string;

  @IsDateString()
  expectedUpdatedAt!: string;

  @IsUUID()
  expectedVersionId!: string;
}
