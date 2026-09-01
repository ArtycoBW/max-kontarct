import type { ReviewDealFileRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { DealFileReviewStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewDealFileDto implements ReviewDealFileRequest {
  @ApiProperty({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment!: string | null;

  @ApiProperty({ enum: [DealFileReviewStatus.ACCEPTED, DealFileReviewStatus.REJECTED] })
  @IsIn([DealFileReviewStatus.ACCEPTED, DealFileReviewStatus.REJECTED])
  status!: "ACCEPTED" | "REJECTED";
}
