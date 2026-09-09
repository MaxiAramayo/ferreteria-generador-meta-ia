/**
 * Bandeja durable de alertas operativas.
 *
 * El detector vive junto a PostgreSQL porque sólo allí están las ocurrencias,
 * los intentos y la salud de conexiones que la sustentan. Ninguna consulta lee
 * secretos ni payloads de proveedores; las filas que salen de este archivo
 * contienen IDs internos, códigos y una acción segura.
 */

import { randomUUID } from "node:crypto";

import {
  publicationOperationalAlertFingerprint,
  safeActionForPublicationManualReason,
  validateAuditMetadata,
  type PublicationManualReason,
  type PublicationOperationalAlertCandidate,
  type PublicationOperationalAlertCause,
  type PublicationOperationalAlertKind,
  type PublicationOperationalAlertRecord,
  type PublicationOperationalAlertRepository,
  type PublicationOperationalAlertSafeAction,
  type PublicationOperationalAlertSeverity,
  type PublicationOperationalAlertSweepInput,
  type PublicationOperationalAlertSweepResult,
  type PublicationTarget,
  type ResolvePublicationOperationalAlertResult,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

const sweepLimitMaximum = 100;

const alertSelection = {
  cause: true,
  fingerprint: true,
  firstObservedAt: true,
  id: true,
  kind: true,
  lastObservedAt: true,
  metaConnectionId: true,
  observations: true,
  publicationId: true,
  publicationTarget: true,
  resolvedAt: true,
  safeAction: true,
  scheduleOccurrenceId: true,
  severity: true,
} satisfies Prisma.PublicationOperationalAlertSelect;

type AlertRow = Prisma.PublicationOperationalAlertGetPayload<{
  select: typeof alertSelection;
}>;

type ManualCandidateRow = Readonly<{
  manualReason: string;
  organizationId: string;
  publicationId: string;
  publicationTarget: string;
  publicationTargetId: string;
  scheduledAt: Date | null;
}>;

type StuckOccurrenceCandidateRow = Readonly<{
  dispatchRequestedAt: Date | null;
  occurrenceId: string;
  organizationId: string;
  publicationId: string;
  publicationTarget: string;
}>;

type DegradedConnectionCandidateRow = Readonly<{
  hasNearOccurrence: boolean;
  metaConnectionId: string;
  organizationId: string;
}>;

function assertSweepInput(input: PublicationOperationalAlertSweepInput): void {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > sweepLimitMaximum
  ) {
    throw new RangeError(
      `Alert sweep limit must be between 1 and ${String(sweepLimitMaximum)}.`,
    );
  }
  if (
    input.occurrenceStuckThresholdMilliseconds <= 0 ||
    input.nearPublicationWindowMilliseconds <= 0
  ) {
    throw new RangeError("Los umbrales de alertas deben ser positivos.");
  }
  if (!Number.isFinite(Date.parse(input.at))) {
    throw new RangeError(
      "La fecha de observación debe ser un instante válido.",
    );
  }
}

function publicationTarget(value: string): PublicationTarget {
  if (
    value === "facebook_page" ||
    value === "instagram_feed" ||
    value === "instagram_story"
  ) {
    return value;
  }
  throw new Error(`Destino de publicación desconocido en alerta: ${value}.`);
}

function alertKind(value: string): PublicationOperationalAlertKind {
  if (
    value === "connection-degraded" ||
    value === "occurrence-stuck" ||
    value === "publication-manual-action"
  ) {
    return value;
  }
  throw new Error(`Clase de alerta desconocida: ${value}.`);
}

function alertCause(value: string): PublicationOperationalAlertCause {
  if (
    value === "attempts-exhausted" ||
    value === "connection-not-publishable" ||
    value === "dispatch-not-requested" ||
    value === "execution-not-completed" ||
    value === "outcome-unresolved" ||
    value === "permanent-failure"
  ) {
    return value;
  }
  throw new Error(`Causa de alerta desconocida: ${value}.`);
}

function alertSeverity(value: string): PublicationOperationalAlertSeverity {
  if (value === "attention" || value === "urgent") return value;
  throw new Error(`Severidad de alerta desconocida: ${value}.`);
}

function safeAction(value: string): PublicationOperationalAlertSafeAction {
  if (
    value === "inspect-queue" ||
    value === "reconcile" ||
    value === "reconnect-meta" ||
    value === "retry"
  ) {
    return value;
  }
  throw new Error(`Acción segura desconocida: ${value}.`);
}

function manualReason(value: string): PublicationManualReason {
  if (
    value === "attempts-exhausted" ||
    value === "outcome-unresolved" ||
    value === "permanent-failure" ||
    value === "abandoned-by-operator"
  ) {
    return value;
  }
  throw new Error(`Motivo manual desconocido en alerta: ${value}.`);
}

function mapAlert(row: AlertRow): PublicationOperationalAlertRecord {
  return Object.freeze({
    cause: alertCause(row.cause),
    fingerprint: row.fingerprint,
    firstObservedAt: row.firstObservedAt.toISOString(),
    id: row.id,
    kind: alertKind(row.kind),
    lastObservedAt: row.lastObservedAt.toISOString(),
    ...(row.metaConnectionId === null
      ? {}
      : { metaConnectionId: row.metaConnectionId }),
    observations: row.observations,
    ...(row.publicationId === null ? {} : { publicationId: row.publicationId }),
    ...(row.publicationTarget === null
      ? {}
      : { publicationTarget: publicationTarget(row.publicationTarget) }),
    ...(row.resolvedAt === null
      ? {}
      : { resolvedAt: row.resolvedAt.toISOString() }),
    safeAction: safeAction(row.safeAction),
    ...(row.scheduleOccurrenceId === null
      ? {}
      : { scheduleOccurrenceId: row.scheduleOccurrenceId }),
    severity: alertSeverity(row.severity),
  });
}

function metadata(
  candidate: Omit<PublicationOperationalAlertCandidate, "organizationId">,
): Record<string, string> {
  const values: Record<string, string> = {
    cause: candidate.cause,
    kind: candidate.kind,
    safeAction: candidate.safeAction,
    severity: candidate.severity,
  };
  if (candidate.metaConnectionId !== undefined) {
    values["metaConnectionId"] = candidate.metaConnectionId;
  }
  if (candidate.publicationId !== undefined) {
    values["publicationId"] = candidate.publicationId;
  }
  if (candidate.publicationTarget !== undefined) {
    values["publicationTarget"] = candidate.publicationTarget;
  }
  if (candidate.scheduleOccurrenceId !== undefined) {
    values["scheduleOccurrenceId"] = candidate.scheduleOccurrenceId;
  }
  validateAuditMetadata(values);
  return values;
}

function isNearPublication(
  scheduledAt: Date | null,
  observedAt: Date,
  nearWindowMilliseconds: number,
): boolean {
  return (
    scheduledAt !== null &&
    Math.abs(observedAt.getTime() - scheduledAt.getTime()) <=
      nearWindowMilliseconds
  );
}

function manualCandidate(
  row: ManualCandidateRow,
  observedAt: Date,
  nearWindowMilliseconds: number,
): PublicationOperationalAlertCandidate {
  const reason = manualReason(row.manualReason);
  if (reason === "abandoned-by-operator") {
    throw new Error(
      "Un destino abandonado no puede generar una alerta abierta.",
    );
  }
  return Object.freeze({
    cause: reason,
    fingerprint: publicationOperationalAlertFingerprint({
      kind: "publication-manual-action",
      publicationTargetId: row.publicationTargetId,
    }),
    kind: "publication-manual-action",
    organizationId: row.organizationId,
    publicationId: row.publicationId,
    publicationTarget: publicationTarget(row.publicationTarget),
    safeAction: safeActionForPublicationManualReason(reason),
    severity: isNearPublication(
      row.scheduledAt,
      observedAt,
      nearWindowMilliseconds,
    )
      ? "urgent"
      : "attention",
  });
}

function stuckOccurrenceCandidate(
  row: StuckOccurrenceCandidateRow,
): PublicationOperationalAlertCandidate {
  return Object.freeze({
    cause:
      row.dispatchRequestedAt === null
        ? "dispatch-not-requested"
        : "execution-not-completed",
    fingerprint: publicationOperationalAlertFingerprint({
      kind: "occurrence-stuck",
      scheduleOccurrenceId: `${row.occurrenceId}:${row.publicationTarget}`,
    }),
    kind: "occurrence-stuck",
    organizationId: row.organizationId,
    publicationId: row.publicationId,
    publicationTarget: publicationTarget(row.publicationTarget),
    safeAction: "inspect-queue",
    scheduleOccurrenceId: row.occurrenceId,
    severity: "urgent",
  });
}

function degradedConnectionCandidate(
  row: DegradedConnectionCandidateRow,
): PublicationOperationalAlertCandidate {
  return Object.freeze({
    cause: "connection-not-publishable",
    fingerprint: publicationOperationalAlertFingerprint({
      kind: "connection-degraded",
      metaConnectionId: row.metaConnectionId,
    }),
    kind: "connection-degraded",
    metaConnectionId: row.metaConnectionId,
    organizationId: row.organizationId,
    safeAction: "reconnect-meta",
    severity: row.hasNearOccurrence ? "urgent" : "attention",
  });
}

/** Persistencia Prisma del contrato de alertas operativas. */
export class PrismaPublicationOperationalAlertRepository implements PublicationOperationalAlertRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async listOpen(
    organizationId: string,
    limit: number,
  ): Promise<readonly PublicationOperationalAlertRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > sweepLimitMaximum) {
      throw new RangeError(
        `Alert list limit must be between 1 and ${String(sweepLimitMaximum)}.`,
      );
    }
    const rows = await this.#database.publicationOperationalAlert.findMany({
      orderBy: [
        { severity: "desc" },
        { lastObservedAt: "desc" },
        { id: "asc" },
      ],
      select: alertSelection,
      take: limit,
      where: { organizationId, resolvedAt: null },
    });
    return Object.freeze(rows.map(mapAlert));
  }

  async resolve(input: {
    readonly actorMembershipId: string;
    readonly at: string;
    readonly id: string;
    readonly organizationId: string;
  }): Promise<ResolvePublicationOperationalAlertResult> {
    const resolvedAt = new Date(input.at);
    if (!Number.isFinite(resolvedAt.getTime())) {
      throw new RangeError(
        "La fecha de resolución debe ser un instante válido.",
      );
    }
    return this.#database.$transaction(async (transaction) => {
      const current = await transaction.publicationOperationalAlert.findFirst({
        select: alertSelection,
        where: { id: input.id, organizationId: input.organizationId },
      });
      if (current === null) return Object.freeze({ status: "not-found" });
      const alert = mapAlert(current);
      if (alert.resolvedAt !== undefined) {
        return Object.freeze({ alert, status: "already-resolved" });
      }
      const updated = await transaction.publicationOperationalAlert.update({
        data: { resolvedAt },
        select: alertSelection,
        where: { id: current.id },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          entityId: current.id,
          entityType: "publication_operational_alert",
          id: randomUUID(),
          metadata: metadata(alert),
          occurredAt: resolvedAt,
          operation: "scheduling.operational-alert:resolve",
          organizationId: input.organizationId,
          outcome: "success",
        },
      });
      return Object.freeze({ alert: mapAlert(updated), status: "resolved" });
    });
  }

  async sweep(
    input: PublicationOperationalAlertSweepInput,
  ): Promise<PublicationOperationalAlertSweepResult> {
    assertSweepInput(input);
    const observedAt = new Date(input.at);
    const [manualRows, stuckRows, connectionRows] = await Promise.all([
      this.#manualCandidates(input.limit),
      this.#stuckOccurrenceCandidates(
        new Date(
          observedAt.getTime() - input.occurrenceStuckThresholdMilliseconds,
        ),
        input.limit,
      ),
      this.#degradedConnectionCandidates(
        observedAt,
        input.nearPublicationWindowMilliseconds,
        input.limit,
      ),
    ]);
    const candidates = [
      ...manualRows.map((row) =>
        manualCandidate(
          row,
          observedAt,
          input.nearPublicationWindowMilliseconds,
        ),
      ),
      ...stuckRows.map(stuckOccurrenceCandidate),
      ...connectionRows.map(degradedConnectionCandidate),
    ];
    return this.#upsertCandidates(candidates, observedAt);
  }

  async #manualCandidates(
    limit: number,
  ): Promise<readonly ManualCandidateRow[]> {
    const rows = await this.#database.$queryRaw<
      ManualCandidateRow[]
    >(Prisma.sql`
      SELECT
        "target"."id" AS "publicationTargetId",
        "target"."organization_id" AS "organizationId",
        "order"."publication_id" AS "publicationId",
        "target"."target"::text AS "publicationTarget",
        "target"."manual_reason" AS "manualReason",
        "occurrence"."scheduled_at" AS "scheduledAt"
      FROM "publication_order_targets" AS "target"
      INNER JOIN "publication_orders" AS "order"
        ON "order"."organization_id" = "target"."organization_id"
       AND "order"."id" = "target"."order_id"
      LEFT JOIN "publication_schedule_occurrences" AS "occurrence"
        ON "occurrence"."organization_id" = "order"."organization_id"
       AND "occurrence"."publication_order_id" = "order"."id"
      WHERE "target"."manual_reason" IN (
        'attempts-exhausted',
        'outcome-unresolved',
        'permanent-failure'
      )
        AND "order"."cancelled_at" IS NULL
      ORDER BY "target"."updated_at" ASC, "target"."id" ASC
      LIMIT ${limit}
    `);
    return Object.freeze(rows);
  }

  async #stuckOccurrenceCandidates(
    threshold: Date,
    limit: number,
  ): Promise<readonly StuckOccurrenceCandidateRow[]> {
    const rows = await this.#database.$queryRaw<StuckOccurrenceCandidateRow[]>(
      Prisma.sql`
        SELECT
          "occurrence"."id" AS "occurrenceId",
          "occurrence"."organization_id" AS "organizationId",
          "schedule"."publication_id" AS "publicationId",
          "occurrence"."dispatch_requested_at" AS "dispatchRequestedAt",
          "target"."value"::text AS "publicationTarget"
        FROM "publication_schedule_occurrences" AS "occurrence"
        INNER JOIN "publication_schedules" AS "schedule"
          ON "schedule"."organization_id" = "occurrence"."organization_id"
         AND "schedule"."id" = "occurrence"."schedule_id"
        CROSS JOIN LATERAL unnest("schedule"."targets") AS "target"("value")
        WHERE "occurrence"."status" = 'planned'
          AND "schedule"."status" = 'active'
          AND "occurrence"."scheduled_at" <= ${threshold}
        ORDER BY "occurrence"."scheduled_at" ASC, "occurrence"."id" ASC
        LIMIT ${limit}
      `,
    );
    return Object.freeze(rows);
  }

  async #degradedConnectionCandidates(
    observedAt: Date,
    nearPublicationWindowMilliseconds: number,
    limit: number,
  ): Promise<readonly DegradedConnectionCandidateRow[]> {
    const nearUntil = new Date(
      observedAt.getTime() + nearPublicationWindowMilliseconds,
    );
    const rows = await this.#database.$queryRaw<
      DegradedConnectionCandidateRow[]
    >(
      Prisma.sql`
        SELECT
          "connection"."id" AS "metaConnectionId",
          "connection"."organization_id" AS "organizationId",
          EXISTS (
            SELECT 1
            FROM "publication_schedule_occurrences" AS "occurrence"
            INNER JOIN "publication_schedules" AS "schedule"
              ON "schedule"."organization_id" = "occurrence"."organization_id"
             AND "schedule"."id" = "occurrence"."schedule_id"
            WHERE "occurrence"."organization_id" = "connection"."organization_id"
              AND "occurrence"."status" = 'planned'
              AND "schedule"."status" = 'active'
              AND "occurrence"."scheduled_at" >= ${observedAt}
              AND "occurrence"."scheduled_at" <= ${nearUntil}
          ) AS "hasNearOccurrence"
        FROM "meta_connections" AS "connection"
        WHERE "connection"."health"::text <> 'healthy'
        ORDER BY "connection"."updated_at" ASC, "connection"."id" ASC
        LIMIT ${limit}
      `,
    );
    return Object.freeze(rows);
  }

  async #upsertCandidates(
    candidates: readonly PublicationOperationalAlertCandidate[],
    observedAt: Date,
  ): Promise<PublicationOperationalAlertSweepResult> {
    let opened = 0;
    let reopened = 0;
    let updated = 0;
    await this.#database.$transaction(async (transaction) => {
      for (const candidate of candidates) {
        const current = await transaction.publicationOperationalAlert.findFirst(
          {
            select: alertSelection,
            where: {
              fingerprint: candidate.fingerprint,
              organizationId: candidate.organizationId,
            },
          },
        );
        if (current === null) {
          const id = randomUUID();
          await transaction.publicationOperationalAlert.create({
            data: {
              cause: candidate.cause,
              fingerprint: candidate.fingerprint,
              firstObservedAt: observedAt,
              id,
              kind: candidate.kind,
              lastObservedAt: observedAt,
              ...(candidate.metaConnectionId === undefined
                ? {}
                : { metaConnectionId: candidate.metaConnectionId }),
              observations: 1,
              organizationId: candidate.organizationId,
              ...(candidate.publicationId === undefined
                ? {}
                : { publicationId: candidate.publicationId }),
              ...(candidate.publicationTarget === undefined
                ? {}
                : { publicationTarget: candidate.publicationTarget }),
              safeAction: candidate.safeAction,
              ...(candidate.scheduleOccurrenceId === undefined
                ? {}
                : { scheduleOccurrenceId: candidate.scheduleOccurrenceId }),
              severity: candidate.severity,
            },
          });
          await transaction.auditEvent.create({
            data: {
              entityId: id,
              entityType: "publication_operational_alert",
              id: randomUUID(),
              metadata: metadata(candidate),
              occurredAt: observedAt,
              operation: "scheduling.operational-alert:open",
              organizationId: candidate.organizationId,
              outcome: "success",
            },
          });
          opened += 1;
          continue;
        }
        const wasResolved = current.resolvedAt !== null;
        await transaction.publicationOperationalAlert.update({
          data: {
            cause: candidate.cause,
            lastObservedAt: observedAt,
            ...(candidate.metaConnectionId === undefined
              ? {}
              : { metaConnectionId: candidate.metaConnectionId }),
            observations: { increment: 1 },
            ...(candidate.publicationId === undefined
              ? {}
              : { publicationId: candidate.publicationId }),
            ...(candidate.publicationTarget === undefined
              ? {}
              : { publicationTarget: candidate.publicationTarget }),
            ...(wasResolved ? { resolvedAt: null } : {}),
            safeAction: candidate.safeAction,
            ...(candidate.scheduleOccurrenceId === undefined
              ? {}
              : { scheduleOccurrenceId: candidate.scheduleOccurrenceId }),
            severity: candidate.severity,
          },
          where: { id: current.id },
        });
        if (wasResolved) {
          await transaction.auditEvent.create({
            data: {
              entityId: current.id,
              entityType: "publication_operational_alert",
              id: randomUUID(),
              metadata: metadata(candidate),
              occurredAt: observedAt,
              operation: "scheduling.operational-alert:reopen",
              organizationId: candidate.organizationId,
              outcome: "success",
            },
          });
          reopened += 1;
        } else {
          updated += 1;
        }
      }
    });
    return Object.freeze({
      observed: candidates.length,
      opened,
      reopened,
      updated,
    });
  }
}
