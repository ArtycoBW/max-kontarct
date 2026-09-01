import type { NormalizeAddressRequest } from "@max-contract/contracts";
import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class SuggestAddressQueryDto {
  @ApiProperty({ example: "г Москва, ул Тверская" })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  query!: string;
}

export class NormalizeAddressDto implements NormalizeAddressRequest {
  @ApiProperty({ example: "г Москва, ул Тверская, д 1" })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address!: string;
}
