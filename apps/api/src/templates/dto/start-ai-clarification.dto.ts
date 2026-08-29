import type { StartAiClarificationRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsUUID } from "class-validator";

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
}
