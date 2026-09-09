/**
 * Salud operativa de la plataforma.
 *
 * Responde una sola pregunta —¿hay algo que atender ahora?— con números que
 * PostgreSQL ya conoce: trabajo acumulado, atraso, publicaciones que salieron a
 * medias y costo de IA del mes.
 *
 * Los umbrales viven acá y no en la pantalla: un tablero que decide su propio
 * criterio deja de coincidir con la bandeja de alertas y con el runbook, y dos
 * personas mirando lo mismo terminan discutiendo si está mal. La severidad se
 * deriva de señales medidas y cada motivo dice qué umbral se cruzó.
 */

export type OperationalHealthSeverity = "attention" | "healthy" | "urgent";

export type OperationalHealthReasonCode =
  | "ambiguous-targets"
  | "dead-letter-messages"
  | "generation-budget"
  | "occurrence-backlog"
  | "occurrence-delay"
  | "open-alerts"
  | "outbox-age"
  | "outbox-backlog"
  | "partial-publications";

/**
 * Umbrales declarados. Los de ocurrencia repiten los de la bandeja de alertas
 * (`P6-T07`) a propósito: el tablero tiene que contar la misma historia que la
 * alerta que un operador ya recibió.
 */
export const operationalHealthThresholds = Object.freeze({
  ambiguousTargetsUrgent: 1,
  deadLetterUrgent: 1,
  generationBudgetAttentionPercent: 80,
  generationBudgetUrgentPercent: 100,
  occurrenceBacklogAttention: 1,
  occurrenceBacklogUrgent: 5,
  occurrenceDelayAttentionMinutes: 5,
  occurrenceDelayUrgentMinutes: 30,
  outboxAgeAttentionMinutes: 5,
  outboxAgeUrgentMinutes: 30,
  outboxBacklogAttention: 20,
  outboxBacklogUrgent: 100,
  partialPublicationsAttention: 1,
});

export interface OperationalHealthSignals {
  /** Destinos con desenlace remoto indeterminado, pendientes de reconciliar. */
  readonly ambiguousTargets: number;
  readonly deadLetterMessages: number;
  readonly generationBudgetMicrousd: number;
  readonly generationCommittedMicrousd: number;
  readonly maximumOccurrenceDelayMinutes: number;
  readonly oldestPendingOutboxMinutes: number;
  readonly openAttentionAlerts: number;
  readonly openUrgentAlerts: number;
  /** Ocurrencias planificadas cuyo instante ya pasó y siguen sin despachar. */
  readonly overdueOccurrences: number;
  readonly partialPublications: number;
  readonly pendingOutboxMessages: number;
}

export interface OperationalHealthReason {
  readonly code: OperationalHealthReasonCode;
  readonly measured: number;
  readonly severity: Exclude<OperationalHealthSeverity, "healthy">;
  readonly threshold: number;
}

export interface OperationalHealthReport {
  readonly generationBudgetPercent: number;
  readonly reasons: readonly OperationalHealthReason[];
  readonly severity: OperationalHealthSeverity;
  readonly signals: OperationalHealthSignals;
}

function reason(
  code: OperationalHealthReasonCode,
  severity: Exclude<OperationalHealthSeverity, "healthy">,
  measured: number,
  threshold: number,
): OperationalHealthReason {
  return Object.freeze({ code, measured, severity, threshold });
}

/**
 * Un porcentaje sin presupuesto declarado no existe: informar 0 sería decir que
 * sobra presupuesto, e informar 100 que se agotó. Ambas afirmaciones serían
 * inventadas, así que la señal se omite del cálculo.
 */
function budgetPercent(committed: number, budget: number): number {
  return budget <= 0 ? 0 : Math.round((committed / budget) * 100);
}

export function resolveOperationalHealth(
  signals: OperationalHealthSignals,
): OperationalHealthReport {
  const thresholds = operationalHealthThresholds;
  const reasons: OperationalHealthReason[] = [];
  const percent = budgetPercent(
    signals.generationCommittedMicrousd,
    signals.generationBudgetMicrousd,
  );

  if (signals.overdueOccurrences >= thresholds.occurrenceBacklogUrgent) {
    reasons.push(
      reason(
        "occurrence-backlog",
        "urgent",
        signals.overdueOccurrences,
        thresholds.occurrenceBacklogUrgent,
      ),
    );
  } else if (
    signals.overdueOccurrences >= thresholds.occurrenceBacklogAttention
  ) {
    reasons.push(
      reason(
        "occurrence-backlog",
        "attention",
        signals.overdueOccurrences,
        thresholds.occurrenceBacklogAttention,
      ),
    );
  }

  if (
    signals.maximumOccurrenceDelayMinutes >=
    thresholds.occurrenceDelayUrgentMinutes
  ) {
    reasons.push(
      reason(
        "occurrence-delay",
        "urgent",
        signals.maximumOccurrenceDelayMinutes,
        thresholds.occurrenceDelayUrgentMinutes,
      ),
    );
  } else if (
    signals.maximumOccurrenceDelayMinutes >=
    thresholds.occurrenceDelayAttentionMinutes
  ) {
    reasons.push(
      reason(
        "occurrence-delay",
        "attention",
        signals.maximumOccurrenceDelayMinutes,
        thresholds.occurrenceDelayAttentionMinutes,
      ),
    );
  }

  if (signals.pendingOutboxMessages >= thresholds.outboxBacklogUrgent) {
    reasons.push(
      reason(
        "outbox-backlog",
        "urgent",
        signals.pendingOutboxMessages,
        thresholds.outboxBacklogUrgent,
      ),
    );
  } else if (
    signals.pendingOutboxMessages >= thresholds.outboxBacklogAttention
  ) {
    reasons.push(
      reason(
        "outbox-backlog",
        "attention",
        signals.pendingOutboxMessages,
        thresholds.outboxBacklogAttention,
      ),
    );
  }

  if (signals.oldestPendingOutboxMinutes >= thresholds.outboxAgeUrgentMinutes) {
    reasons.push(
      reason(
        "outbox-age",
        "urgent",
        signals.oldestPendingOutboxMinutes,
        thresholds.outboxAgeUrgentMinutes,
      ),
    );
  } else if (
    signals.oldestPendingOutboxMinutes >= thresholds.outboxAgeAttentionMinutes
  ) {
    reasons.push(
      reason(
        "outbox-age",
        "attention",
        signals.oldestPendingOutboxMinutes,
        thresholds.outboxAgeAttentionMinutes,
      ),
    );
  }

  if (signals.deadLetterMessages >= thresholds.deadLetterUrgent) {
    reasons.push(
      reason(
        "dead-letter-messages",
        "urgent",
        signals.deadLetterMessages,
        thresholds.deadLetterUrgent,
      ),
    );
  }

  if (signals.ambiguousTargets >= thresholds.ambiguousTargetsUrgent) {
    reasons.push(
      reason(
        "ambiguous-targets",
        "urgent",
        signals.ambiguousTargets,
        thresholds.ambiguousTargetsUrgent,
      ),
    );
  }

  if (signals.partialPublications >= thresholds.partialPublicationsAttention) {
    reasons.push(
      reason(
        "partial-publications",
        "attention",
        signals.partialPublications,
        thresholds.partialPublicationsAttention,
      ),
    );
  }

  if (signals.generationBudgetMicrousd > 0) {
    if (percent >= thresholds.generationBudgetUrgentPercent) {
      reasons.push(
        reason(
          "generation-budget",
          "urgent",
          percent,
          thresholds.generationBudgetUrgentPercent,
        ),
      );
    } else if (percent >= thresholds.generationBudgetAttentionPercent) {
      reasons.push(
        reason(
          "generation-budget",
          "attention",
          percent,
          thresholds.generationBudgetAttentionPercent,
        ),
      );
    }
  }

  if (signals.openUrgentAlerts > 0) {
    reasons.push(reason("open-alerts", "urgent", signals.openUrgentAlerts, 1));
  } else if (signals.openAttentionAlerts > 0) {
    reasons.push(
      reason("open-alerts", "attention", signals.openAttentionAlerts, 1),
    );
  }

  const severity: OperationalHealthSeverity = reasons.some(
    (entry) => entry.severity === "urgent",
  )
    ? "urgent"
    : reasons.length > 0
      ? "attention"
      : "healthy";

  return Object.freeze({
    generationBudgetPercent: percent,
    reasons: Object.freeze(reasons),
    severity,
    signals,
  });
}

export interface OperationalHealthRepository {
  observe(
    organizationId: string,
    at: string,
  ): Promise<OperationalHealthSignals>;
}
