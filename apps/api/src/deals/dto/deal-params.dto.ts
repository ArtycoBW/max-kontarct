import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class DealParamsDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  dealId!: string;
}
