/**
 * Ejecución persistente de una ocurrencia programada.
 *
 * La lease evita dos propietarios simultáneos. Crear la orden, sus destinos,
 * la transición, la auditoría, el outbox y completar la ocurrencia es una sola
 * transacción. El identificador de la orden es el UUID de la ocurrencia: por
 * eso `orden:destino` es también una clave estable ocurrencia/destino.
 */

import { randomUUID } from "node:crypto";

import {
  approvalPublicationTargetPolicy,
  publicationOrderTopic,
  type AcquirePublicationOccurrenceInput,
  type AcquirePublicationOccurrenceResult,
  type CompletePublicationOccurrenceResult,
  type HeartbeatPublicationOccurrenceInput,
  type HeartbeatPublicationOccurrenceResult,
  type PublicationOccurrenceExecutionLease,
  type PublicationOccurrenceExecutionRepository,
  type PublicationTarget,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function parseInstant(instant: string, field: string): Date {
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.getTime())) {
    throw new RangeError(`${field} must be a valid instant.`);
  }
  return parsed;
}

function assertFutureLease(at: Date, expiresAt: Date): void {
  if (expiresAt <= at) {
    throw new RangeError("leaseExpiresAt must be after at.");
  }
}

function assertUuid(identifier: string, field: string): void {
  if (!uuidPattern.test(identifier)) {
    throw new TypeError(`${field} must be a UUID.`);
  }
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

type LockedOccurrenceRow = Readonly<{
  dispatchEventId: string | null;
  lockExpiresAt: Date | null;
  lockOwnerId: string | null;
  lockToken: string | null;
  publicationOrderId: string | null;
  scheduleStatus: "active" | "cancelled" | "completed" | "expired" | "paused";
  startedAt: Date | null;
  status: "cancelled" | "dispatched" | "planned" | "skipped";
}>;

export class PrismaPublicationOccurrenceExecutionRepository implements PublicationOccurrenceExecutionRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async acquire(
    input: AcquirePublicationOccurrenceInput,
  ): Promise<AcquirePublicationOccurrenceResult> {
    assertUuid(input.organizationId, "organizationId");
    assertUuid(input.occurrenceId, "occurrenceId");
    assertUuid(input.scheduleId, "scheduleId");
    assertUuid(input.dispatchEventId, "dispatchEventId");
    assertUuid(input.lockToken, "lockToken");
    if (input.lockOwnerId.length < 1 || input.lockOwnerId.length > 120) {
      throw new RangeError("lockOwnerId has an invalid length.");
    }
    const at = parseInstant(input.at, "at");
    const leaseExpiresAt = parseInstant(input.leaseExpiresAt, "leaseExpiresAt");
    assertFutureLease(at, leaseExpiresAt);

    return this.#database.$transaction(async (transaction) => {
      const [occurrence] = await transaction.$queryRaw<LockedOccurrenceRow[]>(
        Prisma.sql`
          SELECT
            "occurrence"."status"::text AS "status",
            "occurrence"."publication_order_id" AS "publicationOrderId",
            "occurrence"."dispatch_outbox_event_id" AS "dispatchEventId",
            "occurrence"."execution_lock_owner" AS "lockOwnerId",
            "occurrence"."execution_lock_token" AS "lockToken",
            "occurrence"."execution_lock_expires_at" AS "lockExpiresAt",
            "occurrence"."execution_started_at" AS "startedAt",
            "schedule"."status"::text AS "scheduleStatus"
          FROM "publication_schedule_occurrences" AS "occurrence"
          INNER JOIN "publication_schedules" AS "schedule"
            ON "schedule"."organization_id" = "occurrence"."organization_id"
           AND "schedule"."id" = "occurrence"."schedule_id"
          WHERE "occurrence"."organization_id" = ${input.organizationId}::uuid
            AND "occurrence"."id" = ${input.occurrenceId}::uuid
            AND "occurrence"."schedule_id" = ${input.scheduleId}::uuid
          FOR UPDATE OF "occurrence"
        `,
      );
      if (occurrence === undefined) {
        return Object.freeze({
          reason: "occurrence-unavailable",
          status: "ignored",
        });
      }
      if (occurrence.dispatchEventId !== input.dispatchEventId) {
        return Object.freeze({
          reason: "dispatch-mismatch",
          status: "ignored",
        });
      }
      if (
        occurrence.status === "dispatched" &&
        occurrence.publicationOrderId !== null
      ) {
        return Object.freeze({
          orderId: occurrence.publicationOrderId,
          status: "completed",
        });
      }
      if (occurrence.status !== "planned") {
        return Object.freeze({
          reason: "occurrence-unavailable",
          status: "ignored",
        });
      }
      if (occurrence.scheduleStatus !== "active") {
        return Object.freeze({
          reason: "schedule-inactive",
          status: "ignored",
        });
      }
      if (
        occurrence.lockToken !== null &&
        occurrence.lockExpiresAt !== null &&
        occurrence.lockExpiresAt > at
      ) {
        return Object.freeze({
          retryAt: occurrence.lockExpiresAt.toISOString(),
          status: "busy",
        });
      }

      const updated =
        await transaction.publicationScheduleOccurrence.updateMany({
          data: {
            executionHeartbeatAt: at,
            executionLockExpiresAt: leaseExpiresAt,
            executionLockOwner: input.lockOwnerId,
            executionLockToken: input.lockToken,
            executionStartedAt: occurrence.startedAt ?? at,
            updatedAt: at,
          },
          where: {
            id: input.occurrenceId,
            organizationId: input.organizationId,
            status: "planned",
          },
        });
      if (updated.count !== 1) {
        return Object.freeze({
          reason: "occurrence-unavailable",
          status: "ignored",
        });
      }
      const lease: PublicationOccurrenceExecutionLease = Object.freeze({
        dispatchEventId: input.dispatchEventId,
        expiresAt: leaseExpiresAt.toISOString(),
        occurrenceId: input.occurrenceId,
        organizationId: input.organizationId,
        ownerId: input.lockOwnerId,
        scheduleId: input.scheduleId,
        token: input.lockToken,
      });
      return Object.freeze({ lease, status: "acquired" });
    });
  }

  async heartbeat(
    input: HeartbeatPublicationOccurrenceInput,
  ): Promise<HeartbeatPublicationOccurrenceResult> {
    const at = parseInstant(input.at, "at");
    const leaseExpiresAt = parseInstant(input.leaseExpiresAt, "leaseExpiresAt");
    assertFutureLease(at, leaseExpiresAt);
    const updated =
      await this.#database.publicationScheduleOccurrence.updateMany({
        data: {
          executionHeartbeatAt: at,
          executionLockExpiresAt: leaseExpiresAt,
          updatedAt: at,
        },
        where: {
          executionLockExpiresAt: { gt: at },
          executionLockOwner: input.lease.ownerId,
          executionLockToken: input.lease.token,
          id: input.lease.occurrenceId,
          organizationId: input.lease.organizationId,
          status: "planned",
        },
      });
    return updated.count === 1 ? "renewed" : "lost";
  }

  async complete(
    lease: PublicationOccurrenceExecutionLease,
    completedAt: string,
  ): Promise<CompletePublicationOccurrenceResult> {
    const at = parseInstant(completedAt, "completedAt");
    return this.#database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "publication_schedule_occurrences"
        WHERE "organization_id" = ${lease.organizationId}::uuid
          AND "id" = ${lease.occurrenceId}::uuid
        FOR UPDATE
      `);
      const occurrence =
        await transaction.publicationScheduleOccurrence.findFirst({
          include: {
            schedule: {
              include: {
                approvalSnapshot: {
                  select: {
                    id: true,
                    publicationId: true,
                    snapshot: true,
                  },
                },
                publication: { select: { status: true, version: true } },
              },
            },
          },
          where: {
            id: lease.occurrenceId,
            organizationId: lease.organizationId,
          },
        });
      if (occurrence === null) return Object.freeze({ status: "lost" });
      if (
        occurrence.status === "dispatched" &&
        occurrence.publicationOrderId !== null
      ) {
        return Object.freeze({
          orderId: occurrence.publicationOrderId,
          status: "replayed",
        });
      }
      if (
        occurrence.status !== "planned" ||
        occurrence.dispatchOutboxEventId !== lease.dispatchEventId ||
        occurrence.scheduleId !== lease.scheduleId ||
        occurrence.executionLockOwner !== lease.ownerId ||
        occurrence.executionLockToken !== lease.token ||
        occurrence.executionLockExpiresAt === null ||
        occurrence.executionLockExpiresAt <= at
      ) {
        return Object.freeze({ status: "lost" });
      }

      const schedule = occurrence.schedule;
      if (schedule.status !== "active") {
        await this.#release(transaction, lease, at);
        return Object.freeze({
          reason: "schedule-inactive",
          status: "blocked",
        });
      }
      const publication = schedule.publication;
      if (
        (publication.status !== "approved" &&
          publication.status !== "scheduled") ||
        schedule.approvalSnapshot.publicationId !== schedule.publicationId
      ) {
        await this.#release(transaction, lease, at);
        return Object.freeze({ reason: "not-approved", status: "blocked" });
      }
      const targets = Object.freeze([
        ...new Set(schedule.targets as PublicationTarget[]),
      ]);
      const policy = approvalPublicationTargetPolicy(
        schedule.approvalSnapshot.snapshot,
      );
      if (
        targets.length === 0 ||
        policy.kind === "invalid" ||
        (policy.kind === "exact" && !sameTargets(targets, policy.targets))
      ) {
        await this.#release(transaction, lease, at);
        return Object.freeze({
          reason: "target-policy-conflict",
          status: "blocked",
        });
      }

      const version = publication.version + 1;
      const publicationUpdated = await transaction.publication.updateMany({
        data: {
          failureCode: null,
          failureMessage: null,
          failureOccurredAt: null,
          failureRetryable: null,
          status: "publishing",
          version,
        },
        where: {
          id: schedule.publicationId,
          organizationId: lease.organizationId,
          status: publication.status,
          version: publication.version,
        },
      });
      if (publicationUpdated.count !== 1) {
        return Object.freeze({ status: "lost" });
      }

      // El UUID compartido vuelve explícita la identidad
      // ocurrencia/destino usada después por el diario de intentos.
      const order = await transaction.publicationOrder.create({
        data: {
          approvalSnapshotId: schedule.approvalSnapshotId,
          id: lease.occurrenceId,
          organizationId: lease.organizationId,
          publicationId: schedule.publicationId,
          requestedByMembershipId: schedule.createdByMembershipId,
          targets: { create: targets.map((target) => ({ target })) },
        },
        select: { id: true },
      });
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: schedule.createdByMembershipId,
          commandType: "advance",
          fromStatus: publication.status,
          fromVersion: publication.version,
          occurredAt: at,
          organizationId: lease.organizationId,
          publicationId: schedule.publicationId,
          toStatus: "publishing",
          toVersion: version,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: schedule.createdByMembershipId,
          entityId: lease.occurrenceId,
          entityType: "publication_schedule_occurrence",
          id: randomUUID(),
          metadata: {
            orderId: order.id,
            scheduleId: lease.scheduleId,
            targetCount: targets.length,
          },
          occurredAt: at,
          operation: "scheduling.occurrence.execute",
          organizationId: lease.organizationId,
          outcome: "success",
        },
      });
      await transaction.outboxMessage.create({
        data: {
          aggregateId: order.id,
          aggregateType: "publication_order",
          availableAt: at,
          id: randomUUID(),
          organizationId: lease.organizationId,
          payload: {
            occurrenceId: lease.occurrenceId,
            orderId: order.id,
            publicationId: schedule.publicationId,
          },
          topic: publicationOrderTopic,
        },
      });
      const occurrenceUpdated =
        await transaction.publicationScheduleOccurrence.updateMany({
          data: {
            dispatchedAt: at,
            executionCompletedAt: at,
            executionHeartbeatAt: null,
            executionLockExpiresAt: null,
            executionLockOwner: null,
            executionLockToken: null,
            publicationOrderId: order.id,
            status: "dispatched",
            updatedAt: at,
          },
          where: {
            executionLockOwner: lease.ownerId,
            executionLockToken: lease.token,
            id: lease.occurrenceId,
            organizationId: lease.organizationId,
            status: "planned",
          },
        });
      if (occurrenceUpdated.count !== 1) {
        throw new Error("La lease cambió antes de completar la ocurrencia.");
      }
      return Object.freeze({ orderId: order.id, status: "created" });
    });
  }

  async #release(
    transaction: Prisma.TransactionClient,
    lease: PublicationOccurrenceExecutionLease,
    at: Date,
  ): Promise<void> {
    await transaction.publicationScheduleOccurrence.updateMany({
      data: {
        executionHeartbeatAt: null,
        executionLockExpiresAt: null,
        executionLockOwner: null,
        executionLockToken: null,
        updatedAt: at,
      },
      where: {
        executionLockOwner: lease.ownerId,
        executionLockToken: lease.token,
        id: lease.occurrenceId,
        organizationId: lease.organizationId,
        status: "planned",
      },
    });
  }
}
