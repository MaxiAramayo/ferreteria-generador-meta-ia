import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  ArrayMinSize,
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
} from "class-validator";

export class CreateRecurringStoryRuleDto {
  @IsIn(["human-each-cycle", "automatic-routine"])
  approvalPolicy!: "automatic-routine" | "human-each-cycle";

  /** Orden lunes a domingo de las composiciones de apertura. */
  @IsOptional()
  @ArrayMaxSize(7)
  @ArrayMinSize(7)
  @IsArray()
  @IsIn(["cartel", "horario", "locales"], { each: true })
  designRotation?: ("cartel" | "horario" | "locales")[];

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

  @ArrayNotEmpty()
  @ArrayUnique()
  @IsArray()
  @IsIn([1, 2, 3, 4, 5, 6, 7], { each: true })
  weekdays!: number[];
}
