import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";

const civilDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

export class LocationDayOverrideDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsString()
  @Matches(civilDatePattern)
  localDate!: string;

  @ValidateIf((input: LocationDayOverrideDto) => input.status === "open")
  @IsString()
  @Length(5, 180)
  openingHours?: string;

  @IsString()
  @Length(3, 180)
  sourceLabel!: string;

  @IsIn(["open", "closed"])
  status!: "open" | "closed";
}

export class DeleteLocationDayOverrideDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ListLocationDayOverridesQueryDto {
  @IsString()
  @Matches(civilDatePattern)
  endDate!: string;

  @IsString()
  @Matches(civilDatePattern)
  startDate!: string;
}
