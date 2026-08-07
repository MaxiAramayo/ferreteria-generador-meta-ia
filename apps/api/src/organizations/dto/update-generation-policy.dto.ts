import { Type } from "class-transformer";
import { IsBoolean, IsInt, Max, Min } from "class-validator";

export class UpdateGenerationPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  generatedOrphanRetentionHours!: number;

  @Type(() => Number)
  @IsInt()
  @Min(100_000)
  @Max(1_000_000_000)
  monthlyBudgetMicrousd!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  organizationDailyAttemptLimit!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  originalRetentionDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  referenceRetentionDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  userDailyAttemptLimit!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  warningThresholdPercent!: number;
}
