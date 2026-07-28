import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  @Length(1, 80)
  organizationSlug?: string;

  @IsString()
  @Length(12, 256)
  password!: string;
}
