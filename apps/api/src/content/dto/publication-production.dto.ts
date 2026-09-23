import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

export class PublicationVersionCommandDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}

/**
 * Cuándo sale la pieza que se aprueba.
 *
 * La fecha y la hora son locales del negocio. La zona no viaja desde el
 * navegador: la pone el servidor con la de la sucursal.
 */
export class ApprovePublicationScheduleDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  declare localDate: string;

  @Matches(/^\d{2}:\d{2}$/u)
  declare localTime: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsIn(["facebook_page", "instagram_feed", "instagram_story"], { each: true })
  declare targets: ("facebook_page" | "instagram_feed" | "instagram_story")[];
}

export class ApprovePublicationDto extends PublicationVersionCommandDto {
  /** Ausente: aprobar y nada más, como hasta ahora. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovePublicationScheduleDto)
  declare schedule?: ApprovePublicationScheduleDto;
}
