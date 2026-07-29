import { IsInt, IsString, Length, Min } from "class-validator";

export class UpdateBrandConfigurationDto {
  @IsInt()
  @Min(1)
  brandVersion!: number;

  @IsString()
  @Length(3, 180)
  claim!: string;

  @IsString()
  @Length(3, 120)
  displayName!: string;

  @IsString()
  @Length(2, 80)
  handle!: string;

  @IsString()
  @Length(3, 160)
  legalName!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsInt()
  @Min(1)
  organizationVersion!: number;

  @IsString()
  @Length(2, 80)
  shortName!: string;

  @IsString()
  @Length(3, 20)
  themeId!: string;
}
