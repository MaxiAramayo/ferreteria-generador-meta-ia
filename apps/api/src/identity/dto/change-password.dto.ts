import { IsString, Length } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  @Length(6, 256)
  currentPassword!: string;

  @IsString()
  @Length(6, 256)
  newPassword!: string;
}
