import type {
  PublicationMissedPolicy,
  PublicationMonthDayOverflow,
  PublicationTarget,
  PublicationWeekday,
} from "@aramayo/domain";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const publicationTargets = [
  "facebook_page",
  "instagram_feed",
  "instagram_story",
] as const;
const recurrenceKinds = ["once", "daily", "weekly", "monthly"] as const;

/**
 * Intención civil de una programación. La API la resuelve contra `timeZone`
 * antes de entregarla al dominio: nunca convierte con la zona del servidor.
 */
export class CreatePublicationScheduleDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  effectiveFromLocalDate!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/u)
  effectiveUntilLocalDate?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedPublicationVersion!: number;

  @IsIn(["skip", "next-valid"])
  gapPolicy!: "next-valid" | "skip";

  @IsInt()
  @Max(1440)
  @Min(0)
  @Type(() => Number)
  lateToleranceMinutes!: number;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
  localTime!: string;

  @IsIn(["run-late", "skip"])
  missedPolicy!: PublicationMissedPolicy;

  @ValidateIf(
    (schedule: CreatePublicationScheduleDto) =>
      schedule.recurrenceKind !== "once",
  )
  @IsInt()
  @Max(52)
  @Min(1)
  @Type(() => Number)
  recurrenceInterval?: number;

  @IsIn(recurrenceKinds)
  recurrenceKind!: (typeof recurrenceKinds)[number];

  @ArrayNotEmpty()
  @ArrayUnique()
  @IsArray()
  @IsIn(publicationTargets, { each: true })
  targets!: PublicationTarget[];

  @IsString()
  @MaxLength(80)
  timeZone!: string;

  @ValidateIf(
    (schedule: CreatePublicationScheduleDto) =>
      schedule.recurrenceKind === "monthly",
  )
  @IsInt()
  @Max(31)
  @Min(1)
  @Type(() => Number)
  monthDay?: number;

  @ValidateIf(
    (schedule: CreatePublicationScheduleDto) =>
      schedule.recurrenceKind === "monthly",
  )
  @IsIn(["clamp", "skip"])
  monthDayOverflow?: PublicationMonthDayOverflow;

  @ValidateIf(
    (schedule: CreatePublicationScheduleDto) =>
      schedule.recurrenceKind === "weekly",
  )
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsArray()
  @IsIn([1, 2, 3, 4, 5, 6, 7], { each: true })
  weekdays?: PublicationWeekday[];
}
