import type { ValidateTemplateAnswersRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsUUID } from "class-validator";

export class ValidateTemplateAnswersDto
  implements ValidateTemplateAnswersRequest
{
  @ApiProperty({
    additionalProperties: true,
    example: { paymentAmount: 75_000, subject: "Нежилое помещение" },
    type: "object",
  })
  @IsObject()
  answers!: Record<string, unknown>;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  templateVersionId!: string;
}
