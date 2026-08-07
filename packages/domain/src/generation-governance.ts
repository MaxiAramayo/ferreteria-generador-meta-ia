import type {
  ImageGenerationQuality,
  ImageGenerationSize,
} from "./image-generation.ts";
import type { OrganizationScope } from "./persistence.ts";

export const generationPricingVersion =
  "openai-gpt-image-2-standard-2026-08-05";
export const generationImageModel = "gpt-image-2";
export const generationModerationModel = "omni-moderation-latest";

export const generationPolicyDefaults = Object.freeze({
  enabled: true,
  generatedOrphanRetentionHours: 24,
  monthlyBudgetMicrousd: 20_000_000,
  organizationDailyAttemptLimit: 20,
  originalRetentionDays: 90,
  referenceRetentionDays: 30,
  timeZone: "UTC" as const,
  userDailyAttemptLimit: 8,
  warningThresholdPercent: 80,
});

export interface GenerationPolicy {
  readonly enabled: boolean;
  readonly generatedOrphanRetentionHours: number;
  readonly monthlyBudgetMicrousd: number;
  readonly organizationDailyAttemptLimit: number;
  readonly organizationId: string;
  readonly originalRetentionDays: number;
  readonly referenceRetentionDays: number;
  readonly timeZone: "UTC";
  readonly updatedAt: string;
  readonly userDailyAttemptLimit: number;
  readonly version: number;
  readonly warningThresholdPercent: number;
}

export interface UpdateGenerationPolicyCommand {
  readonly enabled: boolean;
  readonly expectedVersion: number;
  readonly generatedOrphanRetentionHours: number;
  readonly monthlyBudgetMicrousd: number;
  readonly organizationDailyAttemptLimit: number;
  readonly originalRetentionDays: number;
  readonly referenceRetentionDays: number;
  readonly userDailyAttemptLimit: number;
  readonly warningThresholdPercent: number;
}

export class GenerationPolicyValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "GenerationPolicyValidationError";
  }
}

function boundedInteger(
  field: string,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new GenerationPolicyValidationError(
      field,
      `${field} debe ser un entero entre ${String(minimum)} y ${String(maximum)}.`,
    );
  }
  return value;
}

export function normalizeGenerationPolicyUpdate(
  command: UpdateGenerationPolicyCommand,
): UpdateGenerationPolicyCommand {
  return Object.freeze({
    enabled: command.enabled,
    expectedVersion: boundedInteger(
      "expectedVersion",
      command.expectedVersion,
      1,
      2_147_483_647,
    ),
    generatedOrphanRetentionHours: boundedInteger(
      "generatedOrphanRetentionHours",
      command.generatedOrphanRetentionHours,
      1,
      168,
    ),
    monthlyBudgetMicrousd: boundedInteger(
      "monthlyBudgetMicrousd",
      command.monthlyBudgetMicrousd,
      100_000,
      1_000_000_000,
    ),
    organizationDailyAttemptLimit: boundedInteger(
      "organizationDailyAttemptLimit",
      command.organizationDailyAttemptLimit,
      1,
      10_000,
    ),
    originalRetentionDays: boundedInteger(
      "originalRetentionDays",
      command.originalRetentionDays,
      1,
      3650,
    ),
    referenceRetentionDays: boundedInteger(
      "referenceRetentionDays",
      command.referenceRetentionDays,
      1,
      3650,
    ),
    userDailyAttemptLimit: boundedInteger(
      "userDailyAttemptLimit",
      command.userDailyAttemptLimit,
      1,
      1000,
    ),
    warningThresholdPercent: boundedInteger(
      "warningThresholdPercent",
      command.warningThresholdPercent,
      1,
      100,
    ),
  });
}

export const generationAdmissionReasons = [
  "generation-disabled",
  "monthly-budget-exceeded",
  "organization-daily-limit",
  "user-daily-limit",
] as const;

export type GenerationAdmissionReason =
  (typeof generationAdmissionReasons)[number];

export type GenerationAdmission =
  | Readonly<{
      mode: "provider";
      pricingVersion: string;
      referenceCostMicrousd: number;
      reservedCostMicrousd: number;
    }>
  | Readonly<{
      mode: "deterministic";
      reason: GenerationAdmissionReason;
    }>;

export interface GenerationUsageWindow {
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

export interface GenerationPreflight {
  readonly admission: GenerationAdmission;
  readonly model: string;
  readonly quality: ImageGenerationQuality;
  readonly size: ImageGenerationSize;
  readonly usage: GenerationUsageWindow;
  readonly variants: number;
}

export interface GenerationPolicySnapshot {
  readonly policy: GenerationPolicy;
  readonly usage: GenerationUsageWindow;
}

export type GenerationPolicyMutationResult =
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ policy: GenerationPolicy; status: "updated" }>;

export interface GenerationPolicyRepository {
  find(
    scope: OrganizationScope & {
      readonly actorMembershipId: string;
      readonly at: string;
    },
  ): Promise<GenerationPolicySnapshot | null>;
  preflight(
    input: OrganizationScope & {
      readonly actorMembershipId: string;
      readonly at: string;
      readonly quality: ImageGenerationQuality;
      readonly size: ImageGenerationSize;
      readonly variants: number;
    },
  ): Promise<GenerationPreflight | null>;
  update(
    input: OrganizationScope & {
      readonly actorMembershipId: string;
      readonly at: string;
      readonly update: UpdateGenerationPolicyCommand;
    },
  ): Promise<GenerationPolicyMutationResult>;
}

export const generationAttemptStatuses = [
  "reserved",
  "in_flight",
  "settled",
  "unconfirmed",
  "released",
] as const;

export type GenerationAttemptStatus =
  (typeof generationAttemptStatuses)[number];

export interface GenerationAttemptUsage {
  readonly imageInputTokens: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly textInputTokens: number;
  readonly totalTokens: number;
}

export function estimateImageCostMicrousd(
  usage: GenerationAttemptUsage,
): number {
  return (
    usage.textInputTokens * 5 +
    usage.imageInputTokens * 8 +
    usage.outputTokens * 30
  );
}

const outputReferenceMicrousd: Readonly<Record<ImageGenerationSize, number>> =
  Object.freeze({
    "1024x1024": 53_000,
    "1024x1536": 41_000,
    "1536x1024": 41_000,
  });

export function imageReferenceCostMicrousd(
  size: ImageGenerationSize,
  quality: ImageGenerationQuality,
): number {
  if (quality !== "medium") {
    throw new GenerationPolicyValidationError(
      "quality",
      "La política registrada sólo admite calidad medium.",
    );
  }
  return outputReferenceMicrousd[size];
}

/** Reserva conservadora: salida de referencia más un token de texto por carácter permitido. */
export function imageMaximumReservationMicrousd(
  size: ImageGenerationSize,
  quality: ImageGenerationQuality,
): number {
  return imageReferenceCostMicrousd(size, quality) + 32_000 * 5;
}

export type BeginGenerationAttemptResult =
  | Readonly<{ attemptId: string; attemptNumber: number; status: "started" }>
  | Readonly<{ reason: GenerationAdmissionReason; status: "blocked" }>
  | Readonly<{ attempts: number; status: "exhausted" }>
  | Readonly<{ status: "cancelled" }>;

export interface GenerationAttemptLedgerRepository {
  auditModeration(
    input: OrganizationScope & {
      readonly actorMembershipId: string;
      readonly at: string;
      readonly categories: readonly string[];
      readonly model: string;
      readonly outcome: "allowed" | "rejected" | "unavailable";
      readonly phase: "input" | "output";
      readonly requestId: string | null;
      readonly runId: string;
    },
  ): Promise<void>;
  begin(
    input: OrganizationScope & {
      readonly at: string;
      readonly maximumAttempts: number;
      readonly model: string;
      readonly quality: ImageGenerationQuality;
      readonly runId: string;
      readonly size: ImageGenerationSize;
      readonly variantId: string;
    },
  ): Promise<BeginGenerationAttemptResult>;
  markUnconfirmed(
    input: OrganizationScope & {
      readonly at: string;
      readonly attemptId: string;
      readonly requestId: string | null;
    },
  ): Promise<void>;
  recoverInFlight(
    input: OrganizationScope & {
      readonly at: string;
      readonly runId: string;
    },
  ): Promise<void>;
  releaseRunReservations(
    input: OrganizationScope & {
      readonly at: string;
      readonly runId: string;
    },
  ): Promise<void>;
  settle(
    input: OrganizationScope & {
      readonly at: string;
      readonly attemptId: string;
      readonly requestId: string | null;
      readonly usage: GenerationAttemptUsage;
    },
  ): Promise<void>;
}
