/**
 * Gestión transaccional de programaciones ya creadas.
 *
 * Pausar, reanudar o cancelar no son meros cambios de una columna. La
 * operación reúne compare-and-swap de la regla, las ocurrencias que aún se
 * pueden retirar, la eventual vuelta de la publicación a `approved`, auditoría
 * e idempotencia. Separar cualquiera de esos pasos dejaría estados que el
 * calendario no puede explicar ni recuperar.
 */

import {
  transitionPublication,
  transitionPublicationSchedule,
  type ApplyPublicationScheduleTransitionInput,
  type ApplyPublicationScheduleTransitionResult,
  type PublicationMissedPolicy,
  type PublicationRecurrence,
  type PublicationScheduleManagementRepository,
  type PublicationScheduleRecord,
  type PublicationScheduleStatus,
  type PublicationStatus,
  type PublicationTarget,
  type PublicationWeekday,
  type SafeJsonObject,
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
