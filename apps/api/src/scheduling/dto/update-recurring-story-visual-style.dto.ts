import { Type } from "class-transformer";
import { IsIn, IsInt, Min, ValidateIf, ValidateNested } from "class-validator";

import { RecurringStoryPhotoDto } from "./recurring-story-photo.dto.ts";

/** El estilo se reemplaza entero: `photo: null` vuelve a la foto del local. */
export class UpdateRecurringStoryVisualStyleDto {
  @IsIn(["marca", "senal", "verde"])
  accent!: "marca" | "senal" | "verde";

  @IsIn(["cartel", "horario", "locales", "imagen"])
  designVariant!: "cartel" | "horario" | "imagen" | "locales";

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  /**
   * Obligatoria aunque admita `null`: omitirla la rechaza el servicio con un
   * mensaje propio, para que un cliente viejo no borre la foto sin querer.
   */
  @ValidateIf(
    (_input: unknown, value: unknown) => value !== null && value !== undefined,
  )
  @ValidateNested()
  @Type(() => RecurringStoryPhotoDto)
  photo?: RecurringStoryPhotoDto | null;

  @IsIn(["taller", "claro", "promo"])
  theme!: "taller" | "claro" | "promo";
}
