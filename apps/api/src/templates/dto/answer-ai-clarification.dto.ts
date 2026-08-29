import type { AnswerAiClarificationRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsObject } from "class-validator";

export class AnswerAiClarificationDto
  implements AnswerAiClarificationRequest
{
  @ApiProperty({
    additionalProperties: true,
    example: { utilitiesPayer: "tenant" },
    type: "object",
  })
  @IsObject()
  answers!: Record<string, unknown>;
}
