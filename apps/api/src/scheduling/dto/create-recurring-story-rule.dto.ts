import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
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

  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  effectiveFromLocalDate!: string;

  @IsInt()
  @Max(10_080)
  @Min(15)
  @Type(() => Number)
  leadTimeMinutes!: number;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
  localTime!: string;

  @IsUUID("4")
  locationId!: string;

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
