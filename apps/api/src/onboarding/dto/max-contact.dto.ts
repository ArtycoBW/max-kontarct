import { IsString, Length, Matches } from "class-validator";

export class MaxContactDto {
  @IsString()
  @Matches(/^\d{1,16}$/)
  authDate!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  hash!: string;

  @IsString()
  @Length(8, 16)
  @Matches(/^\+?[1-9]\d+$/)
  phone!: string;
}
