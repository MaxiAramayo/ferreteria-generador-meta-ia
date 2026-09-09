/**
 * Salud operativa: una sola respuesta para saber si hay algo que atender.
 *
 * Cada motivo dice qué umbral se cruzó y con qué número, para que la pantalla
 * no tenga que reimplementar el criterio ni inventar uno propio.
 */

export type OperationalHealthSeverityResponse =
  "attention" | "healthy" | "urgent";

export type OperationalHealthReasonCodeResponse =
  | "ambiguous-targets"
  | "dead-letter-messages"
  | "generation-budget"
  | "occurrence-backlog"
  | "occurrence-delay"
  | "open-alerts"
  | "outbox-age"
  | "outbox-backlog"
  | "partial-publications";

export interface OperationalHealthReasonResponse {
  readonly code: OperationalHealthReasonCodeResponse;
  readonly measured: number;
  readonly severity: "attention" | "urgent";
  readonly threshold: number;
}

export interface OperationalHealthSignalsResponse {
  readonly ambiguousTargets: number;
  readonly deadLetterMessages: number;
  readonly generationBudgetMicrousd: number;
  readonly generationCommittedMicrousd: number;
  readonly maximumOccurrenceDelayMinutes: number;
  readonly oldestPendingOutboxMinutes: number;
  readonly openAttentionAlerts: number;
  readonly openUrgentAlerts: number;
  readonly overdueOccurrences: number;
  readonly partialPublications: number;
  readonly pendingOutboxMessages: number;
}

export interface OperationalHealthResponse {
  readonly generationBudgetPercent: number;
  readonly observedAt: string;
  readonly reasons: readonly OperationalHealthReasonResponse[];
  readonly severity: OperationalHealthSeverityResponse;
  readonly signals: OperationalHealthSignalsResponse;
}
