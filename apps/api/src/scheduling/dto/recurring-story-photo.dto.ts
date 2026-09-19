import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * Foto propia de una regla de apertura.
 *
 * El transporte sólo comprueba la forma; la API vuelve a validar los bytes con
 * el motor y el dominio decide lo que es regla de la apertura.
 */
export class RecurringStoryPhotoDto {
  @IsString()
  @MaxLength(160)
  @MinLength(1)
  alt!: string;

  @IsString()
  @Matches(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/u)
  @MaxLength(3_000_000)
  dataUrl!: string;

  @IsInt()
  @Max(100)
  @Min(0)
  focusY!: number;
}
