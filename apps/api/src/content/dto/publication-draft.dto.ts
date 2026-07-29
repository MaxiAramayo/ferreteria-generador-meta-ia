import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  DESIGN_SCHEMA_VERSION,
  FORMAT_IDS,
  ICON_NAMES,
  LAYOUT_IDS,
  THEME_IDS,
} from "@aramayo/design-engine";
import { PUBLICATION_STATUSES } from "@aramayo/domain";

export class PublicationProductReferenceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  declare label: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u)
  declare reference: string;
}

export class PublicationDraftContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_200)
  declare caption: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PublicationProductReferenceDto)
  declare products: PublicationProductReferenceDto[];
}

export class DraftDesignContentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare badge?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare branch?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare callToAction?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare category?: string;

  @IsOptional()
  @IsIn(ICON_NAMES)
  declare icon?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(240, { each: true })
  declare items?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare previousPrice?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare price?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare subtitle?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare title: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  declare validity?: string;
}

export class DraftMediaFocusDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  declare x: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  declare y: number;
}

export class DraftMediaInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  @Matches(/\S/u)
  declare alt: string;

  @IsOptional()
  @IsIn(["contain", "cover"])
  declare fit?: "contain" | "cover";

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftMediaFocusDto)
  declare focus?: DraftMediaFocusDto;

  @IsUUID("4")
  declare mediaAssetId: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(4)
  declare zoom?: number;
}

export class PublicationDraftDesignDto {
  @ValidateNested()
  @Type(() => DraftDesignContentDto)
  declare content: DraftDesignContentDto;

  @IsIn(FORMAT_IDS)
  declare format: string;

  @IsIn(LAYOUT_IDS)
  declare layout: string;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => DraftMediaInputDto)
  declare media: DraftMediaInputDto[];

  @Equals(DESIGN_SCHEMA_VERSION)
  declare schemaVersion: number;

  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{2,63}$/u)
  declare slug: string;

  @IsIn(THEME_IDS)
  declare theme: string;
}

export class CreatePublicationDraftDto {
  @ValidateNested()
  @Type(() => PublicationDraftContentDto)
  declare content: PublicationDraftContentDto;

  @ValidateNested()
  @Type(() => PublicationDraftDesignDto)
  declare design: PublicationDraftDesignDto;

  @IsOptional()
  @IsUUID("4")
  declare locationId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @Matches(/\S/u)
  declare title: string;
}

export class UpdatePublicationDraftDto extends CreatePublicationDraftDto {
  @IsInt()
  @Min(1)
  declare expectedVersion: number;
}

export class PublicationListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit = 20;

  @IsOptional()
  @IsUUID("4")
  declare locationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  @Type(() => Number)
  page = 1;

  @IsOptional()
  @IsIn(PUBLICATION_STATUSES)
  declare status?: (typeof PUBLICATION_STATUSES)[number];
}

export class PublicationRevisionListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit = 20;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  @Type(() => Number)
  page = 1;
}
