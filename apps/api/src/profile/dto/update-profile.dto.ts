import type { UpdateUserProfileRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const PERSON_NAME = /^[\p{L}][\p{L}\p{M}' -]*$/u;

export class UpdateProfileDto implements UpdateUserProfileRequest {
  @ApiProperty({ example: "1995-05-12", nullable: true, type: String })
  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate!: string | null;

  @ApiProperty({ example: "user@example.ru", nullable: true, type: String })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email!: string | null;

  @ApiProperty({ example: "Иван" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(PERSON_NAME)
  firstName!: string;

  @ApiProperty({ example: "Иванов" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(PERSON_NAME)
  lastName!: string;

  @ApiProperty({ example: "Иванович", nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(PERSON_NAME)
  middleName!: string | null;
}
