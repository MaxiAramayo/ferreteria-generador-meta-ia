/**
 * Gestión transaccional de programaciones ya creadas.
 *
 * Pausar, reanudar o cancelar no son meros cambios de una columna. La
 * operación reúne compare-and-swap de la regla, las ocurrencias que aún se
 * pueden retirar, la eventual vuelta de la publicación a `approved`, auditoría
 * e idempotencia. Separar cualquiera de esos pasos dejaría estados que el
 * calendario no puede explicar ni recuperar.
 */

import { randomUUID } from "node:crypto";

import {
  approvalPublicationTargetPolicy,
  diffOccurrences,
  nextOccurrenceAfter,
  planOccurrences,
  publicationScheduleInitialMaterializationHorizonDays,
  transitionPublication,
  transitionPublicationSchedule,
  type ApplyPublicationScheduleTransitionInput,
  type ApplyPublicationScheduleTransitionResult,
  type CreatePublicationScheduleInput,
  type CreatePublicationScheduleResult,
  type PublicationMissedPolicy,
  type PublicationOccurrenceRecord,
  type PublicationOccurrencePlan,
  type PublicationRecurrence,
  type PublicationScheduleManagementRepository,
  type PublicationScheduleRecord,
  type PublicationScheduleRule,
  type PublicationScheduleStatus,
  type PublicationStatus,
  type PublicationTarget,
  type PublicationWeekday,
  type SafeJsonObject,
  type UpdatePublicationScheduleInput,
  type UpdatePublicationScheduleResult,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";
import {
  claimReliableOperation,
  commitReliableOperation,
  discardReliableOperationClaim,
  reliableCommit,
} from "./reliable-operation-repository.ts";

const scheduleSelection = {
  approvalSnapshotId: true,
  approvalSnapshot: {
    select: {
      approvedAt: true,
      approvedByMembershipId: true,
      id: true,
      snapshot: true,
    },
  },
  effectiveFrom: true,
  effectiveUntil: true,
  gapPolicy: true,
  id: true,
  kind: true,
  lateToleranceMinutes: true,
  localTime: true,
  missedPolicy: true,
  monthDay: true,
  monthDayOverflow: true,
  organizationId: true,
  publication: { select: { status: true, version: true } },
  publicationId: true,
  recurrenceInterval: true,
  status: true,
  targets: true,
  timeZone: true,
  version: true,
  weekdays: true,
} satisfies Prisma.PublicationScheduleSelect;

type ScheduleRow = Prisma.PublicationScheduleGetPayload<{
  select: typeof scheduleSelection;
}>;

type LockedPublicationRow = Readonly<{
  status: string;
  version: number;
}>;

type LockedOccurrenceRow = Readonly<{
  dispatchRequestedAt: Date | null;
  occurrenceKey: string;
  publicationOrderId: string | null;
  resolution: string;
  scheduledAt: Date;
  status: string;
}>;

interface OccurrenceMaterializationInput {
  readonly lateToleranceMinutes: number;
  readonly missedPolicy: PublicationMissedPolicy;
  readonly occurredAt: string;
  readonly rule: PublicationScheduleRule;
}

function sameTargets(
  requested: readonly PublicationTarget[],
  approved: readonly PublicationTarget[],
): boolean {
  return (
    requested.length === approved.length &&
    requested.every((target) => approved.includes(target))
  );
}

function occurrencePlans(
  input: OccurrenceMaterializationInput,
  materializedThrough?: Date,
): readonly PublicationOccurrencePlan[] | undefined {
  if (
    !Number.isInteger(input.lateToleranceMinutes) ||
    input.lateToleranceMinutes < 0 ||
    input.lateToleranceMinutes > 1440
  ) {
    return undefined;
  }
  const at = new Date(input.occurredAt);
  if (!Number.isFinite(at.getTime())) {
    throw new RangeError(
      "La creación de programación requiere un instante válido.",
    );
  }
  const from = new Date(
    at.getTime() -
      (input.missedPolicy === "run-late"
        ? input.lateToleranceMinutes * 60_000
        : 0),
  );
  const initialWindowEnd = new Date(
    at.getTime() +
      publicationScheduleInitialMaterializationHorizonDays * 24 * 60 * 60_000,
  );
  const to =
    materializedThrough !== undefined && materializedThrough > initialWindowEnd
      ? new Date(materializedThrough.getTime() + 1)
      : initialWindowEnd;
  const plans = planOccurrences(input.rule, {
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (plans.length > 0) {
    return plans;
  }
  const next = nextOccurrenceAfter(input.rule, to.toISOString());
  return next === undefined ? undefined : Object.freeze([next]);
}

function scheduleRuleColumns(rule: PublicationScheduleRule): Readonly<{
  kind: "daily" | "monthly" | "once" | "weekly";
  monthDay: number | null;
  monthDayOverflow: "clamp" | "skip" | null;
  recurrenceInterval: number | null;
  weekdays: readonly number[];
}> {
  switch (rule.recurrence.kind) {
    case "once":
      return Object.freeze({
        kind: "once",
        monthDay: null,
        monthDayOverflow: null,
        recurrenceInterval: null,
        weekdays: Object.freeze([]),
      });
    case "daily":
      return Object.freeze({
        kind: "daily",
        monthDay: null,
        monthDayOverflow: null,
        recurrenceInterval: rule.recurrence.interval,
        weekdays: Object.freeze([]),
      });
    case "weekly":
      return Object.freeze({
        kind: "weekly",
        monthDay: null,
        monthDayOverflow: null,
        recurrenceInterval: rule.recurrence.interval,
        weekdays: rule.recurrence.weekdays,
      });
    case "monthly":
      return Object.freeze({
        kind: "monthly",
        monthDay: rule.recurrence.monthDay,
        monthDayOverflow: rule.recurrence.overflow,
        recurrenceInterval: rule.recurrence.interval,
        weekdays: Object.freeze([]),
      });
  }
}

function requiredInteger(value: number | null, field: string): number {
  if (value === null || !Number.isInteger(value)) {
    throw new Error(`La programación guardada no tiene ${field} válido.`);
  }
  return value;
}

function publicationTarget(value: string): PublicationTarget {
  switch (value) {
    case "facebook_page":
    case "instagram_feed":
    case "instagram_story":
      return value;
    default:
      throw new Error(`Destino de programación desconocido: ${value}.`);
  }
}

function publicationWeekday(value: number): PublicationWeekday {
  switch (value) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return value;
    default:
      throw new Error(
        `Día semanal de programación desconocido: ${String(value)}.`,
      );
  }
}

function recurrenceFrom(row: ScheduleRow): PublicationRecurrence {
  switch (row.kind) {
    case "once":
      return Object.freeze({ kind: "once" });
    case "daily":
      return Object.freeze({
        interval: requiredInteger(row.recurrenceInterval, "recurrenceInterval"),
        kind: "daily",
      });
    case "weekly":
      return Object.freeze({
        interval: requiredInteger(row.recurrenceInterval, "recurrenceInterval"),
        kind: "weekly",
        weekdays: Object.freeze(row.weekdays.map(publicationWeekday)),
      });
    case "monthly": {
      const overflow = row.monthDayOverflow;
      if (overflow !== "clamp" && overflow !== "skip") {
        throw new Error(
          "La programación mensual no tiene política de desborde.",
        );
      }
      return Object.freeze({
        interval: requiredInteger(row.recurrenceInterval, "recurrenceInterval"),
        kind: "monthly",
        monthDay: requiredInteger(row.monthDay, "monthDay"),
        overflow,
      });
    }
  }
}

function missedPolicy(value: string): PublicationMissedPolicy {
  switch (value) {
    case "run_late":
      return "run-late";
    case "skip":
      return "skip";
    default:
      throw new Error(`Política de atraso desconocida: ${value}.`);
  }
}

function scheduleStatus(value: string): PublicationScheduleStatus {
  switch (value) {
    case "active":
    case "cancelled":
    case "completed":
    case "expired":
    case "paused":
      return value;
    default:
      throw new Error(`Estado de programación desconocido: ${value}.`);
  }
}

function occurrenceResolution(
  value: string,
): PublicationOccurrenceRecord["resolution"] {
  switch (value) {
    case "ambiguous":
    case "exact":
    case "shifted":
      return value;
    default:
      throw new Error(`Resolución de ocurrencia desconocida: ${value}.`);
  }
}

function occurrenceStatus(
  value: string,
): PublicationOccurrenceRecord["status"] {
  switch (value) {
    case "cancelled":
    case "dispatched":
    case "planned":
    case "skipped":
      return value;
    default:
      throw new Error(`Estado de ocurrencia desconocido: ${value}.`);
  }
}

function mapOccurrence(row: LockedOccurrenceRow): PublicationOccurrenceRecord {
  return Object.freeze({
    ...(row.dispatchRequestedAt === null
      ? {}
      : { dispatchRequestedAt: row.dispatchRequestedAt.toISOString() }),
    occurrenceKey: row.occurrenceKey,
    ...(row.publicationOrderId === null
      ? {}
      : { publicationOrderId: row.publicationOrderId }),
    resolution: occurrenceResolution(row.resolution),
    scheduledAt: row.scheduledAt.toISOString(),
    status: occurrenceStatus(row.status),
  });
}

function mapSchedule(row: ScheduleRow): PublicationScheduleRecord {
  const gapPolicy = row.gapPolicy === "next_valid" ? "next-valid" : "skip";
  return Object.freeze({
    approvalSnapshotId: row.approvalSnapshotId,
    id: row.id,
    lateToleranceMinutes: row.lateToleranceMinutes,
    missedPolicy: missedPolicy(row.missedPolicy),
    organizationId: row.organizationId,
    publicationId: row.publicationId,
    rule: Object.freeze({
      effectiveFrom: row.effectiveFrom.toISOString(),
      ...(row.effectiveUntil === null
        ? {}
        : { effectiveUntil: row.effectiveUntil.toISOString() }),
      gapPolicy,
      localTime: row.localTime,
      recurrence: recurrenceFrom(row),
      timeZone: row.timeZone,
    }),
    status: scheduleStatus(row.status),
    targets: Object.freeze(row.targets.map(publicationTarget)),
    version: row.version,
  });
}

function publicationStatus(value: string): PublicationStatus {
  switch (value) {
    case "approved":
    case "cancelled":
    case "draft":
    case "expired":
    case "generating_assets":
    case "generation_failed":
    case "missing_information":
    case "partially_published":
    case "publish_failed":
    case "published":
    case "publishing":
    case "ready_for_review":
    case "retrieving_context":
    case "scheduled":
    case "validation_failed":
      return value;
    default:
      throw new Error(`Estado de publicación desconocido: ${value}.`);
  }
}

function numberAt(
  body: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = body[field];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function replayedTransition(
  responseBody: unknown,
): ApplyPublicationScheduleTransitionResult {
  if (typeof responseBody !== "object" || responseBody === null) {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  const body = responseBody as Record<string, unknown>;
  const scheduleId = body["scheduleId"];
  const version = numberAt(body, "version");
  const cancelledOccurrenceCount = numberAt(body, "cancelledOccurrenceCount");
  const dispatchedOccurrenceCount = numberAt(body, "dispatchedOccurrenceCount");
  const publicationVersion = numberAt(body, "publicationVersion");
  const storedStatus = body["publicationStatus"];
  if (
    typeof scheduleId !== "string" ||
    version === undefined ||
    cancelledOccurrenceCount === undefined ||
    dispatchedOccurrenceCount === undefined ||
    publicationVersion === undefined ||
    typeof storedStatus !== "string"
  ) {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  let status: PublicationStatus;
  try {
    status = publicationStatus(storedStatus);
  } catch {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  return Object.freeze({
    cancelledOccurrenceCount,
    dispatchedOccurrenceCount,
    publication: Object.freeze({
      status,
      version: publicationVersion,
    }),
    replayed: true,
    scheduleId,
    status: "updated",
    version,
  });
}

function replayedCreation(
  responseBody: unknown,
): CreatePublicationScheduleResult {
  if (typeof responseBody !== "object" || responseBody === null) {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  const body = responseBody as Record<string, unknown>;
  const scheduleId = body["scheduleId"];
  const version = numberAt(body, "version");
  const materializedOccurrenceCount = numberAt(
    body,
    "materializedOccurrenceCount",
  );
  const publicationVersion = numberAt(body, "publicationVersion");
  const storedStatus = body["publicationStatus"];
  if (
    typeof scheduleId !== "string" ||
    version === undefined ||
    materializedOccurrenceCount === undefined ||
    publicationVersion === undefined ||
    typeof storedStatus !== "string"
  ) {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  let status: PublicationStatus;
  try {
    status = publicationStatus(storedStatus);
  } catch {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  return Object.freeze({
    materializedOccurrenceCount,
    publication: Object.freeze({ status, version: publicationVersion }),
    replayed: true,
    scheduleId,
    status: "created",
    version,
  });
}

function replayedUpdate(
  responseBody: unknown,
): UpdatePublicationScheduleResult {
  if (typeof responseBody !== "object" || responseBody === null) {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  const body = responseBody as Record<string, unknown>;
  const scheduleId = body["scheduleId"];
  const version = numberAt(body, "version");
  const cancelledOccurrenceCount = numberAt(body, "cancelledOccurrenceCount");
  const createdOccurrenceCount = numberAt(body, "createdOccurrenceCount");
  const frozenOccurrenceCount = numberAt(body, "frozenOccurrenceCount");
  const rescheduledOccurrenceCount = numberAt(
    body,
    "rescheduledOccurrenceCount",
  );
  if (
    typeof scheduleId !== "string" ||
    version === undefined ||
    cancelledOccurrenceCount === undefined ||
    createdOccurrenceCount === undefined ||
    frozenOccurrenceCount === undefined ||
    rescheduledOccurrenceCount === undefined
  ) {
    throw new Error("La respuesta idempotente de programación es inválida.");
  }
  return Object.freeze({
    cancelledOccurrenceCount,
    createdOccurrenceCount,
    frozenOccurrenceCount,
    replayed: true,
    rescheduledOccurrenceCount,
    scheduleId,
    status: "updated",
    version,
  });
}

function scheduleMutation(
  command: ApplyPublicationScheduleTransitionInput["command"],
  at: Date,
  version: number,
): Prisma.PublicationScheduleUpdateManyMutationInput {
  switch (command.type) {
    case "pause":
      return {
        pausedAt: at,
        status: "paused",
        updatedAt: at,
        version,
      };
    case "resume":
      return {
        pausedAt: null,
        status: "active",
        updatedAt: at,
        version,
      };
    case "cancel":
      return {
        cancelledAt: at,
        cancelledReasonCode: command.reasonCode,
        pausedAt: null,
        status: "cancelled",
        updatedAt: at,
        version,
      };
  }
}

export class PrismaPublicationScheduleManagementRepository implements PublicationScheduleManagementRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async create(
    input: CreatePublicationScheduleInput,
  ): Promise<CreatePublicationScheduleResult> {
    if (
      input.actorMembershipId !==
        input.reliableOperation.claim.actorMembershipId ||
      input.reliableOperation.claim.organizationId !== input.organizationId
    ) {
      throw new Error(
        "El contexto idempotente no coincide con la programación.",
      );
    }
    if (
      input.targets.length === 0 ||
      new Set(input.targets).size !== input.targets.length
    ) {
      return Object.freeze({ status: "invalid-target" });
    }

    let plans: readonly PublicationOccurrencePlan[] | undefined;
    try {
      plans = occurrencePlans({
        lateToleranceMinutes: input.lateToleranceMinutes,
        missedPolicy: input.missedPolicy,
        occurredAt: input.reliableOperation.occurredAt,
        rule: input.rule,
      });
    } catch (error: unknown) {
      if (error instanceof RangeError) {
        return Object.freeze({ status: "invalid-rule" });
      }
      throw error;
    }
    if (plans === undefined) {
      return Object.freeze({ status: "invalid-rule" });
    }
    const at = new Date(input.reliableOperation.occurredAt);
    const ruleColumns = scheduleRuleColumns(input.rule);

    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          return replayedCreation(claim.responseBody);
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "claimed":
          break;
      }

      const [publication] = await transaction.$queryRaw<
        LockedPublicationRow[]
      >(Prisma.sql`
          SELECT "status"::text AS "status", "version"
          FROM "publications"
          WHERE "id" = ${input.publicationId}::uuid
            AND "organization_id" = ${input.organizationId}::uuid
          FOR UPDATE
        `);
      if (publication === undefined) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      if (publication.version !== input.expectedPublicationVersion) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      if (
        publication.status !== "approved" &&
        publication.status !== "scheduled"
      ) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-approved" });
      }

      const snapshot = await transaction.approvalSnapshot.findFirst({
        orderBy: { approvedAt: "desc" },
        select: {
          approvedAt: true,
          approvedByMembershipId: true,
          id: true,
          snapshot: true,
        },
        where: {
          organizationId: input.organizationId,
          publicationId: input.publicationId,
        },
      });
      if (snapshot === null) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-approved" });
      }
      const targetPolicy = approvalPublicationTargetPolicy(snapshot.snapshot);
      if (
        targetPolicy.kind === "invalid" ||
        (targetPolicy.kind === "exact" &&
          !sameTargets(input.targets, targetPolicy.targets))
      ) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-target" });
      }

      let currentPublication = Object.freeze({
        status: publicationStatus(publication.status),
        version: publication.version,
      });
      if (publication.status === "approved") {
        const publicationTransition = transitionPublication(
          {
            approval: {
              approvedAt: snapshot.approvedAt.toISOString(),
              reviewerMembershipId: snapshot.approvedByMembershipId,
              snapshotId: snapshot.id,
            },
            id: input.publicationId,
            organizationId: input.organizationId,
            status: "approved",
            version: publication.version,
          },
          {
            actorMembershipId: input.actorMembershipId,
            expectedVersion: publication.version,
            occurredAt: input.reliableOperation.occurredAt,
            targetStatus: "scheduled",
            type: "advance",
          },
        );
        if (!publicationTransition.ok) {
          throw new Error("No se pudo programar la publicación aprobada.");
        }
        const publicationUpdated = await transaction.publication.updateMany({
          data: {
            status: publicationTransition.state.status,
            version: publicationTransition.state.version,
          },
          where: {
            id: input.publicationId,
            organizationId: input.organizationId,
            status: publication.status,
            version: publication.version,
          },
        });
        if (publicationUpdated.count !== 1) {
          throw new Error("La publicación cambió durante la programación.");
        }
        await transaction.publicationStateTransition.create({
          data: {
            actorMembershipId: publicationTransition.event.actorMembershipId,
            commandType: publicationTransition.event.commandType,
            fromStatus: publicationTransition.event.fromStatus,
            fromVersion: publicationTransition.event.fromVersion,
            occurredAt: at,
            organizationId: input.organizationId,
            publicationId: input.publicationId,
            reasonCode: publicationTransition.event.reasonCode ?? null,
            toStatus: publicationTransition.event.toStatus,
            toVersion: publicationTransition.event.toVersion,
          },
        });
        currentPublication = Object.freeze({
          status: publicationTransition.state.status,
          version: publicationTransition.state.version,
        });
      }

      const scheduleId = randomUUID();
      await transaction.publicationSchedule.create({
        data: {
          approvalSnapshotId: snapshot.id,
          createdByMembershipId: input.actorMembershipId,
          effectiveFrom: new Date(input.rule.effectiveFrom),
          effectiveUntil:
            input.rule.effectiveUntil === undefined
              ? null
              : new Date(input.rule.effectiveUntil),
          gapPolicy:
            input.rule.gapPolicy === "next-valid" ? "next_valid" : "skip",
          id: scheduleId,
          kind: ruleColumns.kind,
          lateToleranceMinutes: input.lateToleranceMinutes,
          localTime: input.rule.localTime,
          missedPolicy: input.missedPolicy === "run-late" ? "run_late" : "skip",
          monthDay: ruleColumns.monthDay,
          monthDayOverflow: ruleColumns.monthDayOverflow,
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          recurrenceInterval: ruleColumns.recurrenceInterval,
          targets: [...input.targets],
          timeZone: input.rule.timeZone,
          weekdays: [...ruleColumns.weekdays],
        },
      });
      await transaction.publicationScheduleOccurrence.createMany({
        data: plans.map((plan) => ({
          occurrenceKey: plan.occurrenceKey,
          organizationId: input.organizationId,
          resolution: plan.resolution,
          scheduleId,
          scheduledAt: new Date(plan.scheduledAt),
        })),
      });

      const responseBody = {
        materializedOccurrenceCount: plans.length,
        publicationStatus: currentPublication.status,
        publicationVersion: currentPublication.version,
        scheduleId,
        version: 1,
      } satisfies SafeJsonObject;
      const commit = reliableCommit(
        {
          actorMembershipId: input.actorMembershipId,
          organizationId: input.organizationId,
          reliableOperation: input.reliableOperation,
        },
        claim.recordId,
        responseBody,
        {
          entityId: scheduleId,
          entityType: "publication_schedule",
          metadata: {
            materializedOccurrenceCount: plans.length,
            publicationId: input.publicationId,
            targetCount: input.targets.length,
          },
          outbox: [],
        },
      );
      if (!(await commitReliableOperation(transaction, commit))) {
        throw new Error("No se pudo confirmar la programación idempotente.");
      }
      return Object.freeze({
        materializedOccurrenceCount: plans.length,
        publication: currentPublication,
        scheduleId,
        status: "created",
        version: 1,
      });
    });
  }

  async update(
    input: UpdatePublicationScheduleInput,
  ): Promise<UpdatePublicationScheduleResult> {
    if (
      input.actorMembershipId !==
        input.reliableOperation.claim.actorMembershipId ||
      input.reliableOperation.claim.organizationId !== input.organizationId
    ) {
      throw new Error(
        "El contexto idempotente no coincide con la programación.",
      );
    }
    if (
      input.targets.length === 0 ||
      new Set(input.targets).size !== input.targets.length
    ) {
      return Object.freeze({ status: "invalid-target" });
    }
    const at = new Date(input.reliableOperation.occurredAt);
    if (!Number.isFinite(at.getTime())) {
      throw new RangeError(
        "La actualización de programación requiere un instante válido.",
      );
    }
    const ruleColumns = scheduleRuleColumns(input.rule);

    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          return replayedUpdate(claim.responseBody);
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "claimed":
          break;
      }

      const locks = await transaction.$queryRaw<readonly { id: string }[]>(
        Prisma.sql`
          SELECT "id"
          FROM "publication_schedules"
          WHERE "id" = ${input.scheduleId}::uuid
            AND "organization_id" = ${input.organizationId}::uuid
          FOR UPDATE
        `,
      );
      if (locks[0] === undefined) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      const stored = await transaction.publicationSchedule.findFirst({
        select: scheduleSelection,
        where: { id: input.scheduleId, organizationId: input.organizationId },
      });
      if (stored === null) {
        throw new Error("La programación bloqueada desapareció.");
      }
      if (stored.version !== input.expectedVersion) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      if (stored.status !== "active" && stored.status !== "paused") {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-state" });
      }
      const targetPolicy = approvalPublicationTargetPolicy(
        stored.approvalSnapshot.snapshot,
      );
      if (
        targetPolicy.kind === "invalid" ||
        (targetPolicy.kind === "exact" &&
          !sameTargets(input.targets, targetPolicy.targets))
      ) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-target" });
      }

      const occurrenceRows = await transaction.$queryRaw<
        LockedOccurrenceRow[]
      >(Prisma.sql`
          SELECT
            "occurrence_key" AS "occurrenceKey",
            "scheduled_at" AS "scheduledAt",
            "resolution"::text AS "resolution",
            "status"::text AS "status",
            "publication_order_id" AS "publicationOrderId",
            "dispatch_requested_at" AS "dispatchRequestedAt"
          FROM "publication_schedule_occurrences"
          WHERE "organization_id" = ${input.organizationId}::uuid
            AND "schedule_id" = ${input.scheduleId}::uuid
          ORDER BY "scheduled_at" ASC, "occurrence_key" ASC
          FOR UPDATE
        `);
      const existing = occurrenceRows.map(mapOccurrence);
      const materializedThrough = occurrenceRows.reduce<Date | undefined>(
        (latest, occurrence) =>
          latest === undefined || occurrence.scheduledAt > latest
            ? occurrence.scheduledAt
            : latest,
        undefined,
      );
      let plans: readonly PublicationOccurrencePlan[] | undefined;
      try {
        plans = occurrencePlans(
          {
            lateToleranceMinutes: input.lateToleranceMinutes,
            missedPolicy: input.missedPolicy,
            occurredAt: input.reliableOperation.occurredAt,
            rule: input.rule,
          },
          materializedThrough,
        );
      } catch (error: unknown) {
        if (error instanceof RangeError) {
          await discardReliableOperationClaim(transaction, claim.recordId);
          return Object.freeze({ status: "invalid-rule" });
        }
        throw error;
      }
      if (plans === undefined) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-rule" });
      }
      const diff = diffOccurrences(plans, existing);
      const version = stored.version + 1;
      const scheduleUpdated = await transaction.publicationSchedule.updateMany({
        data: {
          effectiveFrom: new Date(input.rule.effectiveFrom),
          effectiveUntil:
            input.rule.effectiveUntil === undefined
              ? null
              : new Date(input.rule.effectiveUntil),
          gapPolicy:
            input.rule.gapPolicy === "next-valid" ? "next_valid" : "skip",
          kind: ruleColumns.kind,
          lateToleranceMinutes: input.lateToleranceMinutes,
          localTime: input.rule.localTime,
          missedPolicy: input.missedPolicy === "run-late" ? "run_late" : "skip",
          monthDay: ruleColumns.monthDay,
          monthDayOverflow: ruleColumns.monthDayOverflow,
          recurrenceInterval: ruleColumns.recurrenceInterval,
          targets: [...input.targets],
          timeZone: input.rule.timeZone,
          updatedAt: at,
          version,
          weekdays: [...ruleColumns.weekdays],
        },
        where: {
          id: input.scheduleId,
          organizationId: input.organizationId,
          status: stored.status,
          version: stored.version,
        },
      });
      if (scheduleUpdated.count !== 1) {
        throw new Error("La programación cambió durante la actualización.");
      }

      if (diff.obsolete.length > 0) {
        const cancelled =
          await transaction.publicationScheduleOccurrence.updateMany({
            data: { cancelledAt: at, status: "cancelled", updatedAt: at },
            where: {
              dispatchOutboxEventId: null,
              occurrenceKey: { in: [...diff.obsolete] },
              organizationId: input.organizationId,
              scheduleId: input.scheduleId,
              status: "planned",
            },
          });
        if (cancelled.count !== diff.obsolete.length) {
          throw new Error(
            "Una ocurrencia cambió durante la actualización de la regla.",
          );
        }
      }
      for (const occurrence of diff.reschedule) {
        const rescheduled =
          await transaction.publicationScheduleOccurrence.updateMany({
            data: {
              resolution: occurrence.resolution,
              scheduledAt: new Date(occurrence.scheduledAt),
              updatedAt: at,
            },
            where: {
              dispatchOutboxEventId: null,
              occurrenceKey: occurrence.occurrenceKey,
              organizationId: input.organizationId,
              scheduleId: input.scheduleId,
              status: "planned",
            },
          });
        if (rescheduled.count !== 1) {
          throw new Error(
            "Una ocurrencia cambió durante la actualización de la regla.",
          );
        }
      }
      if (diff.create.length > 0) {
        await transaction.publicationScheduleOccurrence.createMany({
          data: diff.create.map((occurrence) => ({
            occurrenceKey: occurrence.occurrenceKey,
            organizationId: input.organizationId,
            resolution: occurrence.resolution,
            scheduleId: input.scheduleId,
            scheduledAt: new Date(occurrence.scheduledAt),
          })),
        });
      }

      const responseBody = {
        cancelledOccurrenceCount: diff.obsolete.length,
        createdOccurrenceCount: diff.create.length,
        frozenOccurrenceCount: diff.frozen.length,
        rescheduledOccurrenceCount: diff.reschedule.length,
        scheduleId: input.scheduleId,
        version,
      } satisfies SafeJsonObject;
      const commit = reliableCommit(
        {
          actorMembershipId: input.actorMembershipId,
          organizationId: input.organizationId,
          reliableOperation: input.reliableOperation,
        },
        claim.recordId,
        responseBody,
        {
          entityId: input.scheduleId,
          entityType: "publication_schedule",
          metadata: {
            cancelledOccurrenceCount: diff.obsolete.length,
            createdOccurrenceCount: diff.create.length,
            frozenOccurrenceCount: diff.frozen.length,
            publicationId: stored.publicationId,
            rescheduledOccurrenceCount: diff.reschedule.length,
            version,
          },
          outbox: [],
        },
      );
      if (!(await commitReliableOperation(transaction, commit))) {
        throw new Error("No se pudo confirmar la actualización idempotente.");
      }
      return Object.freeze({
        cancelledOccurrenceCount: diff.obsolete.length,
        createdOccurrenceCount: diff.create.length,
        frozenOccurrenceCount: diff.frozen.length,
        rescheduledOccurrenceCount: diff.reschedule.length,
        scheduleId: input.scheduleId,
        status: "updated",
        version,
      });
    });
  }

  async transition(
    input: ApplyPublicationScheduleTransitionInput,
  ): Promise<ApplyPublicationScheduleTransitionResult> {
    if (
      input.command.actorMembershipId !==
        input.reliableOperation.claim.actorMembershipId ||
      input.command.occurredAt !== input.reliableOperation.occurredAt ||
      input.reliableOperation.claim.organizationId !== input.organizationId
    ) {
      throw new Error("El contexto idempotente no coincide con la transición.");
    }
    const at = new Date(input.command.occurredAt);
    if (!Number.isFinite(at.getTime())) {
      throw new RangeError(
        "La transición de programación requiere un instante válido.",
      );
    }

    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          return replayedTransition(claim.responseBody);
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "claimed":
          break;
      }

      const stored = await transaction.publicationSchedule.findFirst({
        select: scheduleSelection,
        where: { id: input.scheduleId, organizationId: input.organizationId },
      });
      if (stored === null) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      const schedule = mapSchedule(stored);
      const transition = transitionPublicationSchedule(schedule, input.command);
      if (!transition.ok) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({
          status:
            transition.error.code === "version-conflict"
              ? "conflict"
              : "invalid-state",
        });
      }

      const updated = await transaction.publicationSchedule.updateMany({
        data: scheduleMutation(input.command, at, transition.schedule.version),
        where: {
          id: input.scheduleId,
          organizationId: input.organizationId,
          status: transition.event.fromStatus,
          version: transition.event.fromVersion,
        },
      });
      if (updated.count !== 1) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }

      let cancelledOccurrenceCount = 0;
      let dispatchedOccurrenceCount = 0;
      let currentPublication = Object.freeze({
        status: publicationStatus(stored.publication.status),
        version: stored.publication.version,
      });
      if (input.command.type === "cancel") {
        const cancelled =
          await transaction.publicationScheduleOccurrence.updateMany({
            data: { cancelledAt: at, status: "cancelled", updatedAt: at },
            where: {
              organizationId: input.organizationId,
              scheduleId: input.scheduleId,
              status: "planned",
            },
          });
        cancelledOccurrenceCount = cancelled.count;
        dispatchedOccurrenceCount =
          await transaction.publicationScheduleOccurrence.count({
            where: {
              organizationId: input.organizationId,
              scheduleId: input.scheduleId,
              status: "dispatched",
            },
          });
        const [lockedPublication] = await transaction.$queryRaw<
          LockedPublicationRow[]
        >(Prisma.sql`
            SELECT "status"::text AS "status", "version"
            FROM "publications"
            WHERE "id" = ${schedule.publicationId}::uuid
              AND "organization_id" = ${input.organizationId}::uuid
            FOR UPDATE
          `);
        if (lockedPublication === undefined) {
          throw new Error("La publicación de la programación desapareció.");
        }
        currentPublication = Object.freeze({
          status: publicationStatus(lockedPublication.status),
          version: lockedPublication.version,
        });
        const activeSchedules = await transaction.publicationSchedule.count({
          where: {
            organizationId: input.organizationId,
            publicationId: schedule.publicationId,
            status: { in: ["active", "paused"] },
          },
        });
        if (activeSchedules === 0 && lockedPublication.status === "scheduled") {
          const publicationTransition = transitionPublication(
            {
              approval: {
                approvedAt: stored.approvalSnapshot.approvedAt.toISOString(),
                reviewerMembershipId:
                  stored.approvalSnapshot.approvedByMembershipId,
                snapshotId: stored.approvalSnapshot.id,
              },
              id: schedule.publicationId,
              organizationId: input.organizationId,
              status: lockedPublication.status,
              version: lockedPublication.version,
            },
            {
              actorMembershipId: input.command.actorMembershipId,
              expectedVersion: lockedPublication.version,
              occurredAt: input.command.occurredAt,
              reasonCode: input.command.reasonCode,
              type: "unschedule",
            },
          );
          if (!publicationTransition.ok) {
            throw new Error(
              "No se pudo retirar la publicación del calendario.",
            );
          }
          const publicationUpdated = await transaction.publication.updateMany({
            data: {
              status: publicationTransition.state.status,
              version: publicationTransition.state.version,
            },
            where: {
              id: schedule.publicationId,
              organizationId: input.organizationId,
              status: lockedPublication.status,
              version: lockedPublication.version,
            },
          });
          if (publicationUpdated.count !== 1) {
            throw new Error("La publicación cambió durante la cancelación.");
          }
          await transaction.publicationStateTransition.create({
            data: {
              actorMembershipId: publicationTransition.event.actorMembershipId,
              commandType: publicationTransition.event.commandType,
              fromStatus: publicationTransition.event.fromStatus,
              fromVersion: publicationTransition.event.fromVersion,
              occurredAt: at,
              organizationId: input.organizationId,
              publicationId: schedule.publicationId,
              reasonCode: publicationTransition.event.reasonCode ?? null,
              toStatus: publicationTransition.event.toStatus,
              toVersion: publicationTransition.event.toVersion,
            },
          });
          currentPublication = Object.freeze({
            status: publicationTransition.state.status,
            version: publicationTransition.state.version,
          });
        }
      }

      const responseBody = {
        cancelledOccurrenceCount,
        dispatchedOccurrenceCount,
        publicationStatus: currentPublication.status,
        publicationVersion: currentPublication.version,
        scheduleId: input.scheduleId,
        version: transition.schedule.version,
      } satisfies SafeJsonObject;
      const commit = reliableCommit(
        {
          actorMembershipId: input.command.actorMembershipId,
          organizationId: input.organizationId,
          reliableOperation: input.reliableOperation,
        },
        claim.recordId,
        responseBody,
        {
          entityId: input.scheduleId,
          entityType: "publication_schedule",
          metadata: {
            cancelledOccurrenceCount,
            command: input.command.type,
            dispatchedOccurrenceCount,
            publicationId: schedule.publicationId,
            version: transition.schedule.version,
          },
          outbox: [],
        },
      );
      if (!(await commitReliableOperation(transaction, commit))) {
        throw new Error("No se pudo confirmar la transición idempotente.");
      }
      return Object.freeze({
        cancelledOccurrenceCount,
        dispatchedOccurrenceCount,
        publication: currentPublication,
        scheduleId: input.scheduleId,
        status: "updated",
        version: transition.schedule.version,
      });
    });
  }
}
