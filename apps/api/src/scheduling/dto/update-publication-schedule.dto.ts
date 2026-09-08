import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

import { PublicationScheduleRuleDto } from "./publication-schedule-rule.dto.ts";

/** Mueve una regla existente desde su propia versión conocida. */
export class UpdatePublicationScheduleDto extends PublicationScheduleRuleDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expectedVersion!: number;
}
