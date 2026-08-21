import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class MetaSignedRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(8_192)
  signed_request!: string;
}

export class MetaDeletionStatusQueryDto {
  @IsString()
  @MaxLength(1_024)
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
  code!: string;
}
