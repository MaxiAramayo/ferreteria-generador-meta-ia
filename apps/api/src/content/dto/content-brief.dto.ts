import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";

import { PublicationDraftDesignDto } from "./publication-draft.dto.ts";

export class RequestContentBriefDto {
  @IsString()
  @MinLength(8)
  @MaxLength(600)
  request!: string;

  /**
   * Sucursal del pedido. El servidor la usa para acotar la recuperación y las
   * herramientas comerciales; el modelo nunca la recibe como argumento.
   */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class ContentBriefHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** `mine=true` restringe el historial a las ejecuciones del propio editor. */
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  mine?: boolean;
}

/**
 * Aceptar sólo aporta el diseño.
 *
 * El copy —título, epígrafe y productos— lo toma el servidor del brief ya
 * validado contra evidencia. Si viajara en el body, aceptar sería una vía para
 * publicar afirmaciones que ninguna fuente sustenta.
 */
export class AcceptContentBriefDto {
  @ValidateNested()
  @Type(() => PublicationDraftDesignDto)
  design!: PublicationDraftDesignDto;
}
