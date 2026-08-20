import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
} from "class-validator";

/** Destinos que la API admite hoy. Ampliarlos es una decisión del contrato. */
const publicationOrderTargets = [
  "facebook_page",
  "instagram_feed",
  "instagram_story",
] as const;

export class RequestPublicationOrderDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(publicationOrderTargets.length)
  @IsIn(publicationOrderTargets, { each: true })
  targets!: readonly (typeof publicationOrderTargets)[number][];
}

export class CancelPublicationOrderDto {
  /**
   * Código estable y acotado: se audita y se muestra, así que no puede traer
   * texto libre de quien cancela.
   */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,79}$/u)
  reasonCode!: string;
}
