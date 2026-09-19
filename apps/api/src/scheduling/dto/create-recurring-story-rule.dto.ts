import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
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

import { RecurringStoryPhotoDto } from "./recurring-story-photo.dto.ts";

export class CreateRecurringStoryRuleDto {
  @IsOptional()
  @IsIn(["marca", "senal", "verde"])
  accent?: "marca" | "senal" | "verde";

  @IsIn(["human-each-cycle", "automatic-routine"])
  approvalPolicy!: "automatic-routine" | "human-each-cycle";

  /** Composición para todos los días seleccionados de esta regla. */
  @IsOptional()
  @IsIn(["cartel", "horario", "locales", "imagen"])
  designVariant?: "cartel" | "horario" | "imagen" | "locales";

  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  effectiveFromLocalDate!: string;

  @IsInt()
  @Max(10_080)
  @Min(15)
  @Type(() => Number)
  leadTimeMinutes!: number;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
  localTime!: string;

  /** Sin sucursal, la regla es para todas las sucursales activas. */
  @IsOptional()
  @IsUUID("4")
  locationId?: string;

  @IsString()
  @MaxLength(180)
  @MinLength(1)
  name!: string;

  /** Sin foto, la historia usa la foto del local. */
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurringStoryPhotoDto)
  photo?: RecurringStoryPhotoDto;

  @IsOptional()
  @IsIn(["taller", "claro", "promo"])
  theme?: "taller" | "claro" | "promo";

  @ArrayNotEmpty()
  @ArrayUnique()
  @IsArray()
  @IsIn([1, 2, 3, 4, 5, 6, 7], { each: true })
  weekdays!: number[];
}
