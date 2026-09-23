import { IsIn, IsInt, Min } from "class-validator";

/** Pausar, reanudar o borrar: sólo hace falta contra qué versión se pide. */
export class RecurringStoryRuleVersionDto {
  @IsInt()
  @Min(1)
  declare expectedVersion: number;
}

export class RecurringStoryRuleStatusDto extends RecurringStoryRuleVersionDto {
  @IsIn(["active", "paused"])
  declare status: "active" | "paused";
}
