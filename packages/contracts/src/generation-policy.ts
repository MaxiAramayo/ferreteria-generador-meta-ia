export type GenerationAdmissionReasonResponse =
  | "generation-disabled"
  | "monthly-budget-exceeded"
  | "organization-daily-limit"
  | "user-daily-limit";

export type GenerationAdmissionResponse =
  | Readonly<{
      mode: "provider";
      pricingVersion: string;
      referenceCostMicrousd: number;
      reservedCostMicrousd: number;
    }>
  | Readonly<{
      mode: "deterministic";
      reason: GenerationAdmissionReasonResponse;
    }>;

export interface GenerationUsageWindowResponse {
  readonly alertActive: boolean;
  readonly committedMicrousd: number;
  readonly monthlyBudgetMicrousd: number;
  readonly monthUtc: string;
  readonly organizationAttemptsRemaining: number;
  readonly reservedMicrousd: number;
  readonly settledMicrousd: number;
  readonly unconfirmedMicrousd: number;
  readonly userAttemptsRemaining: number;
}

export interface GenerationPolicyResponse {
  readonly enabled: boolean;
  readonly generatedOrphanRetentionHours: number;
  readonly monthlyBudgetMicrousd: number;
  readonly organizationDailyAttemptLimit: number;
  readonly organizationId: string;
  readonly originalRetentionDays: number;
  readonly referenceRetentionDays: number;
  readonly timeZone: "UTC";
  readonly updatedAt: string;
  readonly usage: GenerationUsageWindowResponse;
  readonly userDailyAttemptLimit: number;
  readonly version: number;
  readonly warningThresholdPercent: number;
}

export interface GenerationPreflightResponse {
  readonly admission: GenerationAdmissionResponse;
  readonly model: string;
  readonly quality: string;
  readonly size: string;
  readonly usage: GenerationUsageWindowResponse;
  readonly variants: number;
}
