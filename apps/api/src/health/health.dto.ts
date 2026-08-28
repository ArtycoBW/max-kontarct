import { ApiProperty } from "@nestjs/swagger";

export class DependencyCheckDto {
  @ApiProperty({ enum: ["up", "down"] })
  status!: "up" | "down";
}

export class LiveHealthDto {
  @ApiProperty({ example: "ok" })
  status!: "ok";

  @ApiProperty({ example: "2026-08-28T09:00:00.000Z" })
  timestamp!: string;
}

export class ReadyHealthDto extends LiveHealthDto {
  @ApiProperty({
    additionalProperties: { $ref: "#/components/schemas/DependencyCheckDto" },
    example: {
      postgres: { status: "up" },
      redis: { status: "up" },
      storage: { status: "up" },
    },
    type: "object",
  })
  checks!: Record<string, DependencyCheckDto>;
}
