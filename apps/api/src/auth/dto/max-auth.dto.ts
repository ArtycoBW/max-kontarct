import { IsString, MaxLength, MinLength } from "class-validator";

export class MaxAuthDto {
  @IsString()
  @MinLength(32)
  @MaxLength(16_384)
  initData!: string;
}
