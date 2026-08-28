import { IsBoolean } from "class-validator";

export class RecordConsentsDto {
  @IsBoolean()
  personalData!: boolean;

  @IsBoolean()
  statusNotifications!: boolean;

  @IsBoolean()
  termsOfUse!: boolean;
}
