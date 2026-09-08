import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from "class-validator";

const publicationScheduleCommands = ["pause", "resume", "cancel"] as const;

export class TransitionPublicationScheduleDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;

  /** Sólo es obligatorio al cancelar; nunca viaja como texto libre. */
  @ValidateIf(
    (command: TransitionPublicationScheduleDto) => command.type === "cancel",
  )
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,79}$/u)
  reasonCode?: string;

  @IsIn(publicationScheduleCommands)
  type!: (typeof publicationScheduleCommands)[number];
}
