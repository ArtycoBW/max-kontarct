import type { StartAiClarificationRequest } from "@max-contract/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsUUID, IsOptional, IsString, MaxLength } from "class-validator";

export class StartAiClarificationDto
  implements StartAiClarificationRequest
{
  @ApiProperty({
    additionalProperties: true,
    example: { paymentAmount: 120_000, subject: "Нежилое помещение" },
    type: "object",
  })
  @IsObject()
  answers!: Record<string, unknown>;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  templateVersionId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
