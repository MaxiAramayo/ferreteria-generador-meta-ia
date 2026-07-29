import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";

export class UpdateLocationConfigurationDto {
  @IsString()
  @Length(5, 200)
  addressLine!: string;

  @IsString()
  @Length(2, 120)
  city!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(5, 180)
  openingHours!: string;

  @IsOptional()
  @IsString()
  @Length(6, 40)
  phone?: string;

  @IsString()
  @Length(2, 120)
  province!: string;

  @IsString()
  @Length(3, 80)
  timeZone!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @Length(6, 40)
  whatsapp?: string;
}
