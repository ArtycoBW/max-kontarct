import type { DealFileCategory as DealFileCategoryContract } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { DealFileCategory } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class UploadDealFileDto {
  @ApiProperty({ enum: DealFileCategory })
  @IsEnum(DealFileCategory)
  category!: DealFileCategoryContract;

  @ApiProperty({ format: "uuid", required: false })
  @IsOptional()
  @IsUUID()
  requirementId?: string;
}
