import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class MetaOAuthCallbackQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2_048)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  error?: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/u)
  state!: string;
}
