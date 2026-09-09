import type { UpdateUserProfileRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

const PERSON_NAME = /^[\p{L}][\p{L}\p{M}' -]*$/u;

class PassportDetailsDto {
  @IsOptional() @IsString() @Matches(/^\d{4}$/) series!: string | null;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) number!: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsISO8601({ strict: true }) issuedAt!: string | null;
  @IsOptional() @IsString() @MaxLength(500) issuer!: string | null;
  @IsOptional() @IsString() @Matches(/^\d{3}-\d{3}$/) divisionCode!: string | null;
  @IsOptional() @IsString() @MaxLength(250) birthPlace!: string | null;
  @IsOptional() @IsIn(["М", "Ж"]) gender!: "М" | "Ж" | null;
}

class NormalizedAddressDto {
  @IsOptional() @IsString() @MaxLength(160) city!: string | null;
  @IsOptional() @IsString() @MaxLength(64) fiasId!: string | null;
  @IsOptional() @IsString() @MaxLength(64) house!: string | null;
  @IsOptional() @IsString() @MaxLength(64) kladrId!: string | null;
  @IsOptional() @IsString() @MaxLength(16) postalCode!: string | null;
  @IsOptional() @IsString() @MaxLength(16) qualityCode!: string | null;
  @IsOptional() @IsString() @MaxLength(160) region!: string | null;
  @IsIn(["DADATA", "MOCK", "MANUAL"]) source!: "DADATA" | "MOCK" | "MANUAL";
  @IsOptional() @IsString() @MaxLength(160) street!: string | null;
  @IsString() @MinLength(5) @MaxLength(500) value!: string;
}

export class UpdateProfileDto implements UpdateUserProfileRequest {
  @IsOptional() @ValidateNested() @Type(() => PassportDetailsDto)
  passport?: PassportDetailsDto | null;

  @ApiProperty({ nullable: true, type: NormalizedAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NormalizedAddressDto)
  address!: NormalizedAddressDto | null;

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
