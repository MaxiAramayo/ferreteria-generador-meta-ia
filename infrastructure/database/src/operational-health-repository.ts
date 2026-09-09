import type {
  OperationalHealthRepository,
  OperationalHealthSignals,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";

/**
 * Señales de salud operativa leídas de PostgreSQL, que es la fuente de verdad.
 *
 * No hay pipeline de métricas ni serie temporal: la pregunta que responde el
 * tablero —¿hay algo que atender ahora?— se contesta con el estado presente de
 * las mismas tablas que gobiernan el trabajo. Un contador que viviera en
 * memoria del proceso mentiría después de cada reinicio.
 */

const countedGenerationStatuses = [
  "reserved",
  "in_flight",
  "settled",
  "unconfirmed",
] as const;

/**
 * Un destino sin confirmación remota exige reconciliar antes de reintentar, así
 * que cuenta igual que uno con desenlace desconocido: ambos son incertidumbre
 * abierta sobre lo que Meta ya hizo.
 */
const unreconciledTargetStates = [
  "outcome_unknown",
  "published_unconfirmed",
] as const;

function minutesBetween(from: Date | null | undefined, to: Date): number {
  if (from === null || from === undefined) {
    return 0;
  }
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}

function monthWindow(at: Date): Readonly<{ end: Date; start: Date }> {
  return Object.freeze({
    end: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)),
    start: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)),
  });
}

export class PrismaOperationalHealthRepository implements OperationalHealthRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async observe(
    organizationId: string,
    at: string,
  ): Promise<OperationalHealthSignals> {
    const observedAt = new Date(at);
    if (!Number.isFinite(observedAt.getTime())) {
      throw new RangeError("El instante de observación no es válido.");
    }
    const month = monthWindow(observedAt);
    const overdueOccurrence = {
      dispatchRequestedAt: null,
      organizationId,
      scheduledAt: { lt: observedAt },
      status: "planned",
    } as const;
    const pendingOutbox = {
      availableAt: { lte: observedAt },
      organizationId,
      status: "pending",
    } as const;

    const [
      overdueOccurrences,
      oldestOccurrence,
      pendingOutboxMessages,
      oldestOutbox,
      deadLetterMessages,
      partialPublications,
      ambiguousTargets,
      alerts,
      policy,
      costs,
    ] = await Promise.all([
      this.#database.publicationScheduleOccurrence.count({
        where: overdueOccurrence,
      }),
      this.#database.publicationScheduleOccurrence.findFirst({
        orderBy: { scheduledAt: "asc" },
        select: { scheduledAt: true },
        where: overdueOccurrence,
      }),
      this.#database.outboxMessage.count({ where: pendingOutbox }),
      this.#database.outboxMessage.findFirst({
        orderBy: { availableAt: "asc" },
        select: { availableAt: true },
        where: pendingOutbox,
      }),
      this.#database.outboxMessage.count({
        where: { organizationId, status: "dead_letter" },
      }),
      this.#database.publication.count({
        where: { organizationId, status: "partially_published" },
      }),
      this.#database.publicationOrderTarget.count({
        where: {
          organizationId,
          reconciledAt: null,
          state: { in: [...unreconciledTargetStates] },
        },
      }),
      this.#database.publicationOperationalAlert.groupBy({
        _count: { _all: true },
        by: ["severity"],
        where: { organizationId, resolvedAt: null },
      }),
      this.#database.generationPolicy.findUnique({
        select: { monthlyBudgetMicrousd: true },
        where: { organizationId },
      }),
      this.#database.generationAttempt.groupBy({
        _sum: { reservedMicrousd: true, settledMicrousd: true },
        by: ["status"],
        where: {
          organizationId,
          reservedAt: { gte: month.start, lt: month.end },
          status: { in: [...countedGenerationStatuses] },
        },
      }),
    ]);

    let generationCommittedMicrousd = 0;
    for (const cost of costs) {
      generationCommittedMicrousd +=
        cost.status === "settled"
          ? (cost._sum.settledMicrousd ?? 0)
          : (cost._sum.reservedMicrousd ?? 0);
    }

    const openAlerts = new Map(
      alerts.map((entry) => [entry.severity, entry._count._all]),
    );

    return Object.freeze({
      ambiguousTargets,
      deadLetterMessages,
      generationBudgetMicrousd: policy?.monthlyBudgetMicrousd ?? 0,
      generationCommittedMicrousd,
      maximumOccurrenceDelayMinutes: minutesBetween(
        oldestOccurrence?.scheduledAt,
        observedAt,
      ),
      oldestPendingOutboxMinutes: minutesBetween(
        oldestOutbox?.availableAt,
        observedAt,
      ),
      openAttentionAlerts: openAlerts.get("attention") ?? 0,
      openUrgentAlerts: openAlerts.get("urgent") ?? 0,
      overdueOccurrences,
      partialPublications,
      pendingOutboxMessages,
    });
  }
}
