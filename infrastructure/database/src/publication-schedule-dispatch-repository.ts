/**
 * Dispatcher persistente de ocurrencias.
 *
 * PostgreSQL decide qué ocurrencia puede salir y conserva la intención antes
 * de tocar Redis. El outbox y `dispatch_requested_at` nacen juntos; si el
 * proceso cae luego del commit, `pendingQueueJobs` reconstruye el transporte.
 */

import { randomUUID } from "node:crypto";

import {
  missedOccurrenceDisposition,
  publicationOccurrenceDispatchTopic,
  type ClaimDuePublicationOccurrencesInput,
  type PublicationOccurrenceClaimSummary,
  type PublicationOccurrenceDispatchJob,
  type PublicationScheduleDispatchMetrics,
  type PublicationScheduleDispatchRepository,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

const dispatchBatchMaximum = 100;

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > dispatchBatchMaximum) {
    throw new RangeError(
      `Dispatch limit must be between 1 and ${String(dispatchBatchMaximum)}.`,
    );
  }
}

function parseInstant(instant: string, field: string): Date {
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.getTime())) {
    throw new RangeError(`${field} must be a valid instant.`);
  }
  return parsed;
}

type DueOccurrenceRow = Readonly<{
  id: string;
  lateToleranceMinutes: number;
  missedPolicy: "run_late" | "skip";
  organizationId: string;
  scheduleId: string;
  scheduledAt: Date;
}>;

type PendingDispatchRow = Readonly<{
  dispatchEventId: string;
  occurrenceId: string;
  organizationId: string;
  scheduleId: string;
}>;

type DispatchMetricsRow = Readonly<{
  backlog: bigint;
  oldestScheduledAt: Date | null;
  queued: bigint;
  unclaimed: bigint;
}>;

function missedPolicy(
  policy: DueOccurrenceRow["missedPolicy"],
): "run-late" | "skip" {
  return policy === "run_late" ? "run-late" : "skip";
}

export class PrismaPublicationScheduleDispatchRepository implements PublicationScheduleDispatchRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async claimDue(
    input: ClaimDuePublicationOccurrencesInput,
  ): Promise<PublicationOccurrenceClaimSummary> {
    assertLimit(input.limit);
    const at = parseInstant(input.at, "at");

    return this.#database.$transaction(async (transaction) => {
      const due = await transaction.$queryRaw<DueOccurrenceRow[]>(Prisma.sql`
        SELECT
          "occurrence"."id",
          "occurrence"."organization_id" AS "organizationId",
          "occurrence"."schedule_id" AS "scheduleId",
          "occurrence"."scheduled_at" AS "scheduledAt",
          "schedule"."missed_policy"::text AS "missedPolicy",
          "schedule"."late_tolerance_minutes" AS "lateToleranceMinutes"
        FROM "publication_schedule_occurrences" AS "occurrence"
        INNER JOIN "publication_schedules" AS "schedule"
          ON "schedule"."organization_id" = "occurrence"."organization_id"
         AND "schedule"."id" = "occurrence"."schedule_id"
        WHERE "occurrence"."status" = 'planned'
          AND "occurrence"."dispatch_outbox_event_id" IS NULL
          AND "occurrence"."scheduled_at" <= ${at}
          AND "schedule"."status" = 'active'
          ${
            input.organizationId === undefined
              ? Prisma.empty
              : Prisma.sql`AND "occurrence"."organization_id" = ${input.organizationId}::uuid`
          }
        ORDER BY
          "occurrence"."scheduled_at" ASC,
          "occurrence"."created_at" ASC,
          "occurrence"."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE OF "occurrence" SKIP LOCKED
      `);

      let dispatchRequested = 0;
      const jobs: PublicationOccurrenceDispatchJob[] = [];
      let skipped = 0;

      for (const occurrence of due) {
        const disposition = missedOccurrenceDisposition(
          {
            lateToleranceMinutes: occurrence.lateToleranceMinutes,
            missedPolicy: missedPolicy(occurrence.missedPolicy),
          },
          { scheduledAt: occurrence.scheduledAt.toISOString() },
          at.toISOString(),
        );

        if (disposition === "skip") {
          const skippedOccurrence =
            await transaction.publicationScheduleOccurrence.updateMany({
              data: {
                skippedReasonCode: "missed-window",
                status: "skipped",
                updatedAt: at,
              },
              where: {
                dispatchOutboxEventId: null,
                id: occurrence.id,
                status: "planned",
              },
            });
          if (skippedOccurrence.count !== 1) {
            throw new Error(
              "La ocurrencia cambió mientras se registraba como vencida.",
            );
          }
          skipped += 1;
          continue;
        }

        const dispatchEventId = randomUUID();
        await transaction.outboxMessage.create({
          data: {
            aggregateId: occurrence.id,
            aggregateType: "publication_schedule_occurrence",
            availableAt: at,
            id: dispatchEventId,
            organizationId: occurrence.organizationId,
            payload: {
              dispatchEventId,
              occurrenceId: occurrence.id,
              scheduleId: occurrence.scheduleId,
            },
            topic: publicationOccurrenceDispatchTopic,
          },
        });
        const marked =
          await transaction.publicationScheduleOccurrence.updateMany({
            data: {
              dispatchOutboxEventId: dispatchEventId,
              dispatchRequestedAt: at,
              updatedAt: at,
            },
            where: {
              dispatchOutboxEventId: null,
              id: occurrence.id,
              status: "planned",
            },
          });
        if (marked.count !== 1) {
          throw new Error(
            "La ocurrencia cambió mientras se solicitaba su despacho.",
          );
        }
        dispatchRequested += 1;
        jobs.push(
          Object.freeze({
            dispatchEventId,
            occurrenceId: occurrence.id,
            organizationId: occurrence.organizationId,
            scheduleId: occurrence.scheduleId,
          }),
        );
      }

      return Object.freeze({
        dispatchRequested,
        jobs: Object.freeze(jobs),
        reviewed: due.length,
        skipped,
      });
    });
  }

  async pendingQueueJobs(
    input: Readonly<{ afterOccurrenceId?: string; limit: number }>,
  ): Promise<readonly PublicationOccurrenceDispatchJob[]> {
    assertLimit(input.limit);
    const rows = await this.#database.$queryRaw<
      PendingDispatchRow[]
    >(Prisma.sql`
      SELECT
        "occurrence"."organization_id" AS "organizationId",
        "occurrence"."id" AS "occurrenceId",
        "occurrence"."schedule_id" AS "scheduleId",
        "occurrence"."dispatch_outbox_event_id" AS "dispatchEventId"
      FROM "publication_schedule_occurrences" AS "occurrence"
      INNER JOIN "publication_schedules" AS "schedule"
        ON "schedule"."organization_id" = "occurrence"."organization_id"
       AND "schedule"."id" = "occurrence"."schedule_id"
      WHERE "occurrence"."status" = 'planned'
        AND "occurrence"."dispatch_outbox_event_id" IS NOT NULL
        AND "schedule"."status" = 'active'
        ${
          input.afterOccurrenceId === undefined
            ? Prisma.empty
            : Prisma.sql`AND "occurrence"."id" > ${input.afterOccurrenceId}::uuid`
        }
      ORDER BY
        "occurrence"."id" ASC
      LIMIT ${input.limit}
    `);
    return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
  }

  async dispatchMetrics(
    at: string,
  ): Promise<PublicationScheduleDispatchMetrics> {
    const measuredAt = parseInstant(at, "at");
    const [metrics] = await this.#database.$queryRaw<DispatchMetricsRow[]>(
      Prisma.sql`
        SELECT
          count(*)::bigint AS "backlog",
          count(*) FILTER (
            WHERE "occurrence"."dispatch_outbox_event_id" IS NOT NULL
          )::bigint AS "queued",
          count(*) FILTER (
            WHERE "occurrence"."dispatch_outbox_event_id" IS NULL
          )::bigint AS "unclaimed",
          min("occurrence"."scheduled_at") AS "oldestScheduledAt"
        FROM "publication_schedule_occurrences" AS "occurrence"
        INNER JOIN "publication_schedules" AS "schedule"
          ON "schedule"."organization_id" = "occurrence"."organization_id"
         AND "schedule"."id" = "occurrence"."schedule_id"
        WHERE "occurrence"."status" = 'planned'
          AND "occurrence"."scheduled_at" <= ${measuredAt}
          AND "schedule"."status" = 'active'
      `,
    );
    if (metrics === undefined) {
      throw new Error("No se pudieron medir las ocurrencias pendientes.");
    }
    const oldest = metrics.oldestScheduledAt;
    return Object.freeze({
      backlog: Number(metrics.backlog),
      lagMilliseconds:
        oldest === null
          ? 0
          : Math.max(0, measuredAt.getTime() - oldest.getTime()),
      queued: Number(metrics.queued),
      unclaimed: Number(metrics.unclaimed),
    });
  }
}
