/**
 * Reposición durable de ocurrencias de programación.
 *
 * La creación inicial deja una ventana acotada para no llenar PostgreSQL con
 * años de filas. Este repositorio la repone en el worker, antes de que se
 * agote. No conoce Redis ni órdenes: su única responsabilidad es mantener la
 * intención calendario en la fuente de verdad.
 */

import {
  nextOccurrenceAfter,
  planOccurrences,
  publicationScheduleInitialMaterializationHorizonDays,
  publicationScheduleMaterializationBatchMaximum,
  type MaterializePublicationSchedulesInput,
  type PublicationMissedPolicy,
  type PublicationOccurrencePlan,
  type PublicationRecurrence,
  type PublicationScheduleGapPolicy,
  type PublicationScheduleMaterializationRepository,
  type PublicationScheduleRule,
  type PublicationWeekday,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

type MaterializationScheduleRow = Readonly<{
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  gapPolicy: "next_valid" | "skip";
  id: string;
  kind: "daily" | "monthly" | "once" | "weekly";
  lateToleranceMinutes: number;
  localTime: string;
  missedPolicy: "run_late" | "skip";
  monthDay: number | null;
  monthDayOverflow: "clamp" | "skip" | null;
  organizationId: string;
  recurrenceInterval: number | null;
  timeZone: string;
  version: number;
  weekdays: number[];
}>;

type OccurrenceRow = Readonly<{
  scheduledAt: Date;
  status: "cancelled" | "dispatched" | "planned" | "skipped";
}>;

function assertLimit(limit: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > publicationScheduleMaterializationBatchMaximum
  ) {
    throw new RangeError(
      `El límite de reposición debe estar entre 1 y ${String(publicationScheduleMaterializationBatchMaximum)}.`,
    );
  }
}

function parseInstant(value: string): Date {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) {
    throw new RangeError("El instante de reposición no es válido.");
  }
  return at;
}

function recurrence(row: MaterializationScheduleRow): PublicationRecurrence {
  switch (row.kind) {
    case "once":
      return Object.freeze({ kind: "once" });
    case "daily":
      if (row.recurrenceInterval === null) {
        throw new Error("La programación diaria no tiene intervalo.");
      }
      return Object.freeze({ interval: row.recurrenceInterval, kind: "daily" });
    case "weekly":
      if (row.recurrenceInterval === null) {
        throw new Error("La programación semanal no tiene intervalo.");
      }
      return Object.freeze({
        interval: row.recurrenceInterval,
        kind: "weekly",
        weekdays: Object.freeze(row.weekdays.map(weekday)),
      });
    case "monthly":
      if (
        row.recurrenceInterval === null ||
        row.monthDay === null ||
        row.monthDayOverflow === null
      ) {
        throw new Error("La programación mensual no está completa.");
      }
      return Object.freeze({
        interval: row.recurrenceInterval,
        kind: "monthly",
        monthDay: row.monthDay,
        overflow: row.monthDayOverflow,
      });
  }
}

function weekday(value: number): PublicationWeekday {
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
      throw new Error("La programación semanal tiene un día inválido.");
  }
}

function rule(row: MaterializationScheduleRow): PublicationScheduleRule {
  const gapPolicy: PublicationScheduleGapPolicy =
    row.gapPolicy === "next_valid" ? "next-valid" : "skip";
  return Object.freeze({
    effectiveFrom: row.effectiveFrom.toISOString(),
    ...(row.effectiveUntil === null
      ? {}
      : { effectiveUntil: row.effectiveUntil.toISOString() }),
    gapPolicy,
    localTime: row.localTime,
    recurrence: recurrence(row),
    timeZone: row.timeZone,
  });
}

function lowerBound(row: MaterializationScheduleRow, at: Date): Date {
  const missedPolicy: PublicationMissedPolicy =
    row.missedPolicy === "run_late" ? "run-late" : "skip";
  return missedPolicy === "run-late"
    ? new Date(at.getTime() - row.lateToleranceMinutes * 60_000)
    : at;
}

function materializationPlans(
  schedule: MaterializationScheduleRow,
  existing: readonly OccurrenceRow[],
  at: Date,
): readonly PublicationOccurrencePlan[] {
  const scheduleRule = rule(schedule);
  const horizon = new Date(
    at.getTime() +
      publicationScheduleInitialMaterializationHorizonDays * 24 * 60 * 60_000,
  );
  const latest = existing.reduce<Date | undefined>(
    (last, occurrence) =>
      last === undefined || occurrence.scheduledAt > last
        ? occurrence.scheduledAt
        : last,
    undefined,
  );
  if (latest !== undefined && latest >= horizon) return Object.freeze([]);
  const from =
    latest === undefined || latest < lowerBound(schedule, at)
      ? lowerBound(schedule, at)
      : new Date(latest.getTime() + 1);
  const plans = planOccurrences(scheduleRule, {
    from: from.toISOString(),
    to: horizon.toISOString(),
  });
  const next = nextOccurrenceAfter(scheduleRule, horizon.toISOString());
  if (next === undefined) return plans;
  return Object.freeze([...plans, next]);
}

export class PrismaPublicationScheduleMaterializationRepository implements PublicationScheduleMaterializationRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async materializeDue(input: MaterializePublicationSchedulesInput): Promise<
    Readonly<{
      completed: number;
      created: number;
      expired: number;
      reviewed: number;
    }>
  > {
    assertLimit(input.limit);
    const at = parseInstant(input.at);
    return this.#database.$transaction(async (transaction) => {
      const schedules = await transaction.$queryRaw<
        MaterializationScheduleRow[]
      >(Prisma.sql`
        SELECT
          "id",
          "organization_id" AS "organizationId",
          "effective_from" AS "effectiveFrom",
          "effective_until" AS "effectiveUntil",
          "gap_policy"::text AS "gapPolicy",
          "kind"::text AS "kind",
          "late_tolerance_minutes" AS "lateToleranceMinutes",
          "local_time" AS "localTime",
          "missed_policy"::text AS "missedPolicy",
          "month_day" AS "monthDay",
          "month_day_overflow"::text AS "monthDayOverflow",
          "recurrence_interval" AS "recurrenceInterval",
          "time_zone" AS "timeZone",
          "version",
          "weekdays"
        FROM "publication_schedules"
        WHERE "status" = 'active'
          ${
            input.organizationId === undefined
              ? Prisma.empty
              : Prisma.sql`AND "organization_id" = ${input.organizationId}::uuid`
          }
        ORDER BY "updated_at" ASC, "id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `);
      let completed = 0;
      let created = 0;
      let expired = 0;
      for (const schedule of schedules) {
        const existing =
          await transaction.publicationScheduleOccurrence.findMany({
            orderBy: [{ scheduledAt: "asc" }, { occurrenceKey: "asc" }],
            select: { scheduledAt: true, status: true },
            where: {
              organizationId: schedule.organizationId,
              scheduleId: schedule.id,
            },
          });
        if (
          schedule.kind === "once" &&
          existing.length > 0 &&
          existing.every((occurrence) => occurrence.status !== "planned")
        ) {
          const updated = await transaction.publicationSchedule.updateMany({
            data: {
              completedAt: at,
              status: "completed",
              updatedAt: at,
              version: schedule.version + 1,
            },
            where: {
              id: schedule.id,
              status: "active",
              version: schedule.version,
            },
          });
          if (updated.count !== 1) {
            throw new Error("La regla única cambió durante su cierre.");
          }
          completed += 1;
          continue;
        }
        if (
          schedule.effectiveUntil !== null &&
          at.getTime() > schedule.effectiveUntil.getTime() &&
          existing.every((occurrence) => occurrence.status !== "planned")
        ) {
          const updated = await transaction.publicationSchedule.updateMany({
            data: {
              expiredAt: at,
              status: "expired",
              updatedAt: at,
              version: schedule.version + 1,
            },
            where: {
              id: schedule.id,
              status: "active",
              version: schedule.version,
            },
          });
          if (updated.count !== 1) {
            throw new Error("La regla cambió durante su expiración.");
          }
          expired += 1;
          continue;
        }
        const plans = materializationPlans(schedule, existing, at);
        if (plans.length === 0) continue;
        const inserted =
          await transaction.publicationScheduleOccurrence.createMany({
            data: plans.map((occurrence) => ({
              occurrenceKey: occurrence.occurrenceKey,
              organizationId: schedule.organizationId,
              resolution: occurrence.resolution,
              scheduleId: schedule.id,
              scheduledAt: new Date(occurrence.scheduledAt),
            })),
            skipDuplicates: true,
          });
        created += inserted.count;
      }
      return Object.freeze({
        completed,
        created,
        expired,
        reviewed: schedules.length,
      });
    });
  }
}
