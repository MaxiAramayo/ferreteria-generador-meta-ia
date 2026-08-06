import { randomUUID } from "node:crypto";

import {
  estimateImageCostMicrousd,
  generationImageModel,
  generationPricingVersion,
  imageMaximumReservationMicrousd,
  imageReferenceCostMicrousd,
  type BeginGenerationAttemptResult,
  type GenerationAdmission,
  type GenerationAdmissionReason,
  type GenerationAttemptLedgerRepository,
  type GenerationPolicy,
  type GenerationPolicyMutationResult,
  type GenerationPolicyRepository,
  type GenerationPolicySnapshot,
  type GenerationPreflight,
  type GenerationUsageWindow,
  type ImageGenerationQuality,
  type ImageGenerationSize,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type { Prisma } from "./generated/prisma/client.ts";

type Transaction = Prisma.TransactionClient;

const policySelection = {
  enabled: true,
  generatedOrphanRetentionHours: true,
  monthlyBudgetMicrousd: true,
  organizationDailyAttemptLimit: true,
  organizationId: true,
  originalRetentionDays: true,
  referenceRetentionDays: true,
  timeZone: true,
  updatedAt: true,
  userDailyAttemptLimit: true,
  version: true,
  warningThresholdPercent: true,
} satisfies Prisma.GenerationPolicySelect;

type PolicyRow = Prisma.GenerationPolicyGetPayload<{
  select: typeof policySelection;
}>;

function mapPolicy(row: PolicyRow): GenerationPolicy {
  if (row.timeZone !== "UTC") {
    throw new Error("La política de generación usa una zona no soportada.");
  }
  return Object.freeze({
    ...row,
    timeZone: "UTC",
    updatedAt: row.updatedAt.toISOString(),
  });
}

function utcWindows(at: Date): Readonly<{
  dayEnd: Date;
  dayStart: Date;
  monthEnd: Date;
  monthStart: Date;
  monthUtc: string;
}> {
  const dayStart = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const monthStart = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1),
  );
  return {
    dayEnd,
    dayStart,
    monthEnd,
    monthStart,
    monthUtc: `${String(at.getUTCFullYear())}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

async function usageFor(
  database: DatabaseClient | Transaction,
  policy: GenerationPolicy,
  actorMembershipId: string,
  at: Date,
): Promise<GenerationUsageWindow> {
  const window = utcWindows(at);
  const countedStatuses = [
    "reserved",
    "in_flight",
    "settled",
    "unconfirmed",
  ] as const;
  const [organizationAttempts, userAttempts, costs, alert] = await Promise.all([
    database.generationAttempt.count({
      where: {
        organizationId: policy.organizationId,
        reservedAt: { gte: window.dayStart, lt: window.dayEnd },
        status: { in: [...countedStatuses] },
      },
    }),
    database.generationAttempt.count({
      where: {
        actorMembershipId,
        organizationId: policy.organizationId,
        reservedAt: { gte: window.dayStart, lt: window.dayEnd },
        status: { in: [...countedStatuses] },
      },
    }),
    database.generationAttempt.groupBy({
      _sum: { reservedMicrousd: true, settledMicrousd: true },
      by: ["status"],
      where: {
        organizationId: policy.organizationId,
        reservedAt: { gte: window.monthStart, lt: window.monthEnd },
        status: { in: [...countedStatuses] },
      },
    }),
    database.generationBudgetAlert.findUnique({
      select: { id: true },
      where: {
        organizationId_monthUtc: {
          monthUtc: window.monthUtc,
          organizationId: policy.organizationId,
        },
      },
    }),
  ]);

  let reservedMicrousd = 0;
  let settledMicrousd = 0;
  let unconfirmedMicrousd = 0;
  for (const cost of costs) {
    if (cost.status === "settled") {
      settledMicrousd += cost._sum.settledMicrousd ?? 0;
    } else if (cost.status === "unconfirmed") {
      unconfirmedMicrousd += cost._sum.reservedMicrousd ?? 0;
    } else {
      reservedMicrousd += cost._sum.reservedMicrousd ?? 0;
    }
  }
  const committedMicrousd =
    reservedMicrousd + settledMicrousd + unconfirmedMicrousd;
  return Object.freeze({
    alertActive:
      alert !== null ||
      committedMicrousd * 100 >=
        policy.monthlyBudgetMicrousd * policy.warningThresholdPercent,
    committedMicrousd,
    monthlyBudgetMicrousd: policy.monthlyBudgetMicrousd,
    monthUtc: window.monthUtc,
    organizationAttemptsRemaining: Math.max(
      policy.organizationDailyAttemptLimit - organizationAttempts,
      0,
    ),
    reservedMicrousd,
    settledMicrousd,
    unconfirmedMicrousd,
    userAttemptsRemaining: Math.max(
      policy.userDailyAttemptLimit - userAttempts,
      0,
    ),
  });
}

function admissionFor(
  policy: GenerationPolicy,
  usage: GenerationUsageWindow,
  variants: number,
  size: ImageGenerationSize,
  quality: ImageGenerationQuality,
): GenerationAdmission {
  let reason: GenerationAdmissionReason | null = null;
  if (!policy.enabled) reason = "generation-disabled";
  else if (usage.organizationAttemptsRemaining < variants)
    reason = "organization-daily-limit";
  else if (usage.userAttemptsRemaining < variants) reason = "user-daily-limit";

  const reservation = imageMaximumReservationMicrousd(size, quality) * variants;
  if (
    reason === null &&
    usage.committedMicrousd + reservation > policy.monthlyBudgetMicrousd
  ) {
    reason = "monthly-budget-exceeded";
  }
  return reason === null
    ? Object.freeze({
        mode: "provider" as const,
        pricingVersion: generationPricingVersion,
        referenceCostMicrousd:
          imageReferenceCostMicrousd(size, quality) * variants,
        reservedCostMicrousd: reservation,
      })
    : Object.freeze({ mode: "deterministic" as const, reason });
}

async function lockedPolicy(
  transaction: Transaction,
  organizationId: string,
): Promise<GenerationPolicy | null> {
  await transaction.$queryRaw`
    SELECT "id" FROM "generation_policies"
    WHERE "organization_id" = ${organizationId}::uuid
    FOR UPDATE
  `;
  const row = await transaction.generationPolicy.findUnique({
    select: policySelection,
    where: { organizationId },
  });
  return row === null ? null : mapPolicy(row);
}

async function maybeEmitAlert(
  transaction: Transaction,
  policy: GenerationPolicy,
  actorMembershipId: string | null,
  at: Date,
): Promise<void> {
  const usage = await usageFor(
    transaction,
    policy,
    actorMembershipId ?? "00000000-0000-0000-0000-000000000000",
    at,
  );
  if (
    usage.committedMicrousd * 100 <
    policy.monthlyBudgetMicrousd * policy.warningThresholdPercent
  ) {
    return;
  }
  const alertId = randomUUID();
  const created = await transaction.generationBudgetAlert.createMany({
    data: {
      committedMicrousd: usage.committedMicrousd,
      id: alertId,
      monthUtc: usage.monthUtc,
      organizationId: policy.organizationId,
      thresholdPercent: policy.warningThresholdPercent,
    },
    skipDuplicates: true,
  });
  if (created.count !== 1) return;
  await transaction.auditEvent.create({
    data: {
      actorMembershipId,
      entityId: usage.monthUtc,
      entityType: "generation-budget",
      id: randomUUID(),
      metadata: {
        committedMicrousd: usage.committedMicrousd,
        monthlyBudgetMicrousd: policy.monthlyBudgetMicrousd,
        thresholdPercent: policy.warningThresholdPercent,
      },
      occurredAt: at,
      operation: "content.generation:budget-warning",
      organizationId: policy.organizationId,
      outcome: "success",
    },
  });
}

export async function reserveInitialGenerationAttempts(
  transaction: Transaction,
  input: Readonly<{
    actorMembershipId: string;
    at: Date;
    organizationId: string;
    quality: ImageGenerationQuality;
    runId: string;
    size: ImageGenerationSize;
    variantIds: readonly string[];
  }>,
): Promise<GenerationAdmission> {
  const policy = await lockedPolicy(transaction, input.organizationId);
  if (policy === null) {
    return { mode: "deterministic", reason: "generation-disabled" };
  }
  const usage = await usageFor(
    transaction,
    policy,
    input.actorMembershipId,
    input.at,
  );
  const admission = admissionFor(
    policy,
    usage,
    input.variantIds.length,
    input.size,
    input.quality,
  );
  if (admission.mode === "deterministic") return admission;

  const reservationPerAttempt = imageMaximumReservationMicrousd(
    input.size,
    input.quality,
  );
  await transaction.generationAttempt.createMany({
    data: input.variantIds.map((variantId) => ({
      actorMembershipId: input.actorMembershipId,
      attemptNumber: 1,
      id: randomUUID(),
      model: generationImageModel,
      organizationId: input.organizationId,
      pricingVersion: generationPricingVersion,
      quality: input.quality,
      reservedAt: input.at,
      reservedMicrousd: reservationPerAttempt,
      runId: input.runId,
      size: input.size,
      status: "reserved" as const,
      variantId,
    })),
  });
  await maybeEmitAlert(transaction, policy, input.actorMembershipId, input.at);
  return admission;
}

export class PrismaGenerationPolicyRepository implements GenerationPolicyRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async find(input: {
    readonly actorMembershipId: string;
    readonly at: string;
    readonly organizationId: string;
  }): Promise<GenerationPolicySnapshot | null> {
    const row = await this.#database.generationPolicy.findUnique({
      select: policySelection,
      where: { organizationId: input.organizationId },
    });
    if (row === null) return null;
    const policy = mapPolicy(row);
    return Object.freeze({
      policy,
      usage: await usageFor(
        this.#database,
        policy,
        input.actorMembershipId,
        new Date(input.at),
      ),
    });
  }

  async preflight(input: {
    readonly actorMembershipId: string;
    readonly at: string;
    readonly organizationId: string;
    readonly quality: ImageGenerationQuality;
    readonly size: ImageGenerationSize;
    readonly variants: number;
  }): Promise<GenerationPreflight | null> {
    const snapshot = await this.find(input);
    if (snapshot === null) return null;
    return Object.freeze({
      admission: admissionFor(
        snapshot.policy,
        snapshot.usage,
        input.variants,
        input.size,
        input.quality,
      ),
      model: generationImageModel,
      quality: input.quality,
      size: input.size,
      usage: snapshot.usage,
      variants: input.variants,
    });
  }

  async update(input: {
    readonly actorMembershipId: string;
    readonly at: string;
    readonly organizationId: string;
    readonly update: Parameters<
      GenerationPolicyRepository["update"]
    >[0]["update"];
  }): Promise<GenerationPolicyMutationResult> {
    return this.#database.$transaction(async (transaction) => {
      const before = await transaction.generationPolicy.findUnique({
        select: policySelection,
        where: { organizationId: input.organizationId },
      });
      if (before === null) return { status: "not-found" as const };
      const updated = await transaction.generationPolicy.updateMany({
        data: {
          enabled: input.update.enabled,
          generatedOrphanRetentionHours:
            input.update.generatedOrphanRetentionHours,
          monthlyBudgetMicrousd: input.update.monthlyBudgetMicrousd,
          organizationDailyAttemptLimit:
            input.update.organizationDailyAttemptLimit,
          originalRetentionDays: input.update.originalRetentionDays,
          referenceRetentionDays: input.update.referenceRetentionDays,
          updatedAt: new Date(input.at),
          userDailyAttemptLimit: input.update.userDailyAttemptLimit,
          version: { increment: 1 },
          warningThresholdPercent: input.update.warningThresholdPercent,
        },
        where: {
          organizationId: input.organizationId,
          version: input.update.expectedVersion,
        },
      });
      if (updated.count !== 1) return { status: "conflict" as const };
      const after = await transaction.generationPolicy.findUniqueOrThrow({
        select: policySelection,
        where: { organizationId: input.organizationId },
      });
      await maybeEmitAlert(
        transaction,
        mapPolicy(after),
        input.actorMembershipId,
        new Date(input.at),
      );
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          entityId: input.organizationId,
          entityType: "generation-policy",
          id: randomUUID(),
          metadata: {
            after: { ...mapPolicy(after) },
            before: { ...mapPolicy(before) },
          },
          occurredAt: new Date(input.at),
          operation: "organization.generation-policy:update",
          organizationId: input.organizationId,
          outcome: "success",
        },
      });
      return { policy: mapPolicy(after), status: "updated" as const };
    });
  }
}

export class PrismaGenerationAttemptLedgerRepository implements GenerationAttemptLedgerRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async auditModeration(input: {
    readonly actorMembershipId: string;
    readonly at: string;
    readonly categories: readonly string[];
    readonly model: string;
    readonly organizationId: string;
    readonly outcome: "allowed" | "rejected" | "unavailable";
    readonly phase: "input" | "output";
    readonly requestId: string | null;
    readonly runId: string;
  }): Promise<void> {
    await this.#database.auditEvent.create({
      data: {
        actorMembershipId: input.actorMembershipId,
        entityId: input.runId,
        entityType: "generation-run",
        id: randomUUID(),
        metadata: {
          categories: [...input.categories],
          model: input.model,
          outcome: input.outcome,
          phase: input.phase,
          requestId: input.requestId,
        },
        occurredAt: new Date(input.at),
        operation: "content.generation:moderation",
        organizationId: input.organizationId,
        outcome: input.outcome === "allowed" ? "success" : "failure",
      },
    });
  }

  async begin(input: {
    readonly at: string;
    readonly maximumAttempts: number;
    readonly model: string;
    readonly organizationId: string;
    readonly quality: ImageGenerationQuality;
    readonly runId: string;
    readonly size: ImageGenerationSize;
    readonly variantId: string;
  }): Promise<BeginGenerationAttemptResult> {
    return this.#database.$transaction(async (transaction) => {
      const at = new Date(input.at);
      const policy = await lockedPolicy(transaction, input.organizationId);
      const run = await transaction.generationRun.findFirst({
        select: {
          actorMembershipId: true,
          admissionMode: true,
          admissionReason: true,
          status: true,
        },
        where: { id: input.runId, organizationId: input.organizationId },
      });
      if (
        run === null ||
        (run.status !== "pending" && run.status !== "running")
      ) {
        return { status: "cancelled" as const };
      }
      if (
        policy === null ||
        !policy.enabled ||
        run.admissionMode !== "provider"
      ) {
        return {
          reason: (run.admissionReason ??
            "generation-disabled") as GenerationAdmissionReason,
          status: "blocked" as const,
        };
      }
      let attempt = await transaction.generationAttempt.findFirst({
        orderBy: { attemptNumber: "asc" },
        where: {
          organizationId: input.organizationId,
          runId: input.runId,
          status: "reserved",
          variantId: input.variantId,
        },
      });
      if (attempt !== null && attempt.attemptNumber > input.maximumAttempts) {
        return {
          attempts: attempt.attemptNumber - 1,
          status: "exhausted" as const,
        };
      }
      if (attempt === null) {
        const maximum = await transaction.generationAttempt.aggregate({
          _max: { attemptNumber: true },
          where: {
            organizationId: input.organizationId,
            variantId: input.variantId,
          },
        });
        const previousAttempts = maximum._max.attemptNumber ?? 0;
        if (previousAttempts >= input.maximumAttempts) {
          return {
            attempts: previousAttempts,
            status: "exhausted" as const,
          };
        }
        const usage = await usageFor(
          transaction,
          policy,
          run.actorMembershipId,
          at,
        );
        const admission = admissionFor(
          policy,
          usage,
          1,
          input.size,
          input.quality,
        );
        if (admission.mode === "deterministic") {
          return { reason: admission.reason, status: "blocked" as const };
        }
        attempt = await transaction.generationAttempt.create({
          data: {
            actorMembershipId: run.actorMembershipId,
            attemptNumber: previousAttempts + 1,
            id: randomUUID(),
            model: input.model,
            organizationId: input.organizationId,
            pricingVersion: generationPricingVersion,
            quality: input.quality,
            reservedAt: at,
            reservedMicrousd: imageMaximumReservationMicrousd(
              input.size,
              input.quality,
            ),
            runId: input.runId,
            size: input.size,
            status: "reserved",
            variantId: input.variantId,
          },
        });
      }
      const started = await transaction.generationAttempt.updateMany({
        data: { startedAt: at, status: "in_flight" },
        where: { id: attempt.id, status: "reserved" },
      });
      if (started.count !== 1) return { status: "cancelled" as const };
      await maybeEmitAlert(transaction, policy, run.actorMembershipId, at);
      return {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: "started" as const,
      };
    });
  }

  async settle(input: {
    readonly at: string;
    readonly attemptId: string;
    readonly organizationId: string;
    readonly requestId: string | null;
    readonly usage: Parameters<
      GenerationAttemptLedgerRepository["settle"]
    >[0]["usage"];
  }): Promise<void> {
    await this.#database.$transaction(async (transaction) => {
      const attempt = await transaction.generationAttempt.findFirst({
        select: { actorMembershipId: true },
        where: { id: input.attemptId, organizationId: input.organizationId },
      });
      if (attempt === null)
        throw new Error("El intento de generación no existe.");
      await transaction.generationAttempt.updateMany({
        data: {
          completedAt: new Date(input.at),
          imageInputTokens: input.usage.imageInputTokens,
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          requestId: input.requestId,
          settledMicrousd: estimateImageCostMicrousd(input.usage),
          status: "settled",
          textInputTokens: input.usage.textInputTokens,
          totalTokens: input.usage.totalTokens,
        },
        where: { id: input.attemptId, status: "in_flight" },
      });
      const policy = await lockedPolicy(transaction, input.organizationId);
      if (policy !== null) {
        await maybeEmitAlert(
          transaction,
          policy,
          attempt.actorMembershipId,
          new Date(input.at),
        );
      }
    });
  }

  async markUnconfirmed(input: {
    readonly at: string;
    readonly attemptId: string;
    readonly organizationId: string;
    readonly requestId: string | null;
  }): Promise<void> {
    await this.#database.generationAttempt.updateMany({
      data: {
        completedAt: new Date(input.at),
        requestId: input.requestId,
        status: "unconfirmed",
      },
      where: {
        id: input.attemptId,
        organizationId: input.organizationId,
        status: "in_flight",
      },
    });
  }

  async recoverInFlight(input: {
    readonly at: string;
    readonly organizationId: string;
    readonly runId: string;
  }): Promise<void> {
    await this.#database.generationAttempt.updateMany({
      data: { completedAt: new Date(input.at), status: "unconfirmed" },
      where: {
        organizationId: input.organizationId,
        runId: input.runId,
        status: "in_flight",
      },
    });
  }

  async releaseRunReservations(input: {
    readonly at: string;
    readonly organizationId: string;
    readonly runId: string;
  }): Promise<void> {
    await this.#database.generationAttempt.updateMany({
      data: { completedAt: new Date(input.at), status: "released" },
      where: {
        organizationId: input.organizationId,
        runId: input.runId,
        status: "reserved",
      },
    });
  }
}
