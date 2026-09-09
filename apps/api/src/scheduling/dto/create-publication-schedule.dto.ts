import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

import { PublicationScheduleRuleDto } from "./publication-schedule-rule.dto.ts";

/** Crea una regla desde una versión conocida de la publicación aprobada. */
export class CreatePublicationScheduleDto extends PublicationScheduleRuleDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedPublicationVersion!: number;
}
