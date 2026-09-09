/**
 * Alertas operativas de programación y publicación.
 *
 * Una alerta no es el fallo que la originó: es la observación durable de que
 * ese fallo todavía necesita atención. Separarlas permite deduplicar los
 * barridos del worker, reconocer una alerta sin borrar el historial y volver a
 * abrirla si la misma condición reaparece. La huella siempre incorpora el
 * recurso concreto; por eso dos ocurrencias de una recurrencia son dos alertas
 * distintas aunque fallen por la misma causa.
 */

import type { PublicationTarget } from "./publication.ts";
import type {
  PublicationManualAction,
  PublicationManualReason,
} from "./publication-retry.ts";

export const publicationOperationalAlertKinds = Object.freeze([
  "connection-degraded",
  "occurrence-stuck",
  "publication-manual-action",
] as const);

export type PublicationOperationalAlertKind =
  (typeof publicationOperationalAlertKinds)[number];

export type PublicationOperationalAlertCause =
  | "attempts-exhausted"
  | "connection-not-publishable"
  | "dispatch-not-requested"
  | "execution-not-completed"
  | "outcome-unresolved"
  | "permanent-failure";

export type PublicationOperationalAlertSafeAction =
  "inspect-queue" | "reconcile" | "reconnect-meta" | "retry";

export type PublicationOperationalAlertSeverity = "attention" | "urgent";

/**
 * Datos mínimos de una condición observada. No admite detalle libre ni payload
 * de proveedor: la bandeja no necesita —ni debe conocer— tokens, respuestas
 * remotas ni contenido de la publicación para decir qué hacer.
 */
export interface PublicationOperationalAlertCandidate {
  readonly cause: PublicationOperationalAlertCause;
  readonly fingerprint: string;
  readonly kind: PublicationOperationalAlertKind;
  readonly metaConnectionId?: string;
  /** Sólo para persistir y aislar el tenant; nunca sale en la bandeja. */
  readonly organizationId: string;
  readonly publicationId?: string;
  readonly publicationTarget?: PublicationTarget;
  readonly safeAction: PublicationOperationalAlertSafeAction;
  readonly scheduleOccurrenceId?: string;
  readonly severity: PublicationOperationalAlertSeverity;
}

export interface PublicationOperationalAlertRecord extends Omit<
  PublicationOperationalAlertCandidate,
  "organizationId"
> {
  readonly firstObservedAt: string;
  readonly id: string;
  readonly lastObservedAt: string;
  readonly observations: number;
  readonly resolvedAt?: string;
}

export interface PublicationOperationalAlertSweepInput {
  readonly at: string;
  /** No se cierran filas por una lectura acotada: resolver requiere evidencia. */
  readonly limit: number;
  readonly nearPublicationWindowMilliseconds: number;
  readonly occurrenceStuckThresholdMilliseconds: number;
}

export interface PublicationOperationalAlertSweepResult {
  readonly observed: number;
  readonly opened: number;
  readonly reopened: number;
  readonly updated: number;
}

export type ResolvePublicationOperationalAlertResult =
  | Readonly<{ alert: PublicationOperationalAlertRecord; status: "resolved" }>
  | Readonly<{
      alert: PublicationOperationalAlertRecord;
      status: "already-resolved";
    }>
  | Readonly<{ status: "not-found" }>;

/**
 * Puerta de persistencia y detección. La implementación resuelve los recursos
 * desde PostgreSQL: al worker no le llegan tokens ni payloads para construir
 * alertas y una consulta truncada nunca cierra alertas que no llegó a revisar.
 */
export interface PublicationOperationalAlertRepository {
  listOpen(
    organizationId: string,
    limit: number,
  ): Promise<readonly PublicationOperationalAlertRecord[]>;
  resolve(input: {
    readonly actorMembershipId: string;
    readonly at: string;
    readonly id: string;
    readonly organizationId: string;
  }): Promise<ResolvePublicationOperationalAlertResult>;
  sweep(
    input: PublicationOperationalAlertSweepInput,
  ): Promise<PublicationOperationalAlertSweepResult>;
}

/** Límites de operación explícitos y comprobables; no dependen de un timer UI. */
export const publicationOperationalAlertPolicy = Object.freeze({
  /** Una ocurrencia vencida sin avanzar durante cinco minutos ya es operativa. */
  occurrenceStuckThresholdMilliseconds: 5 * 60 * 1_000,
  /** Un problema hasta media hora del turno se muestra como urgente. */
  nearPublicationWindowMilliseconds: 30 * 60 * 1_000,
  sweepLimit: 100,
});

/** Acciones que ya valida el servidor para un destino detenido. */
export function safeActionForPublicationManualReason(
  reason: PublicationManualReason,
): PublicationOperationalAlertSafeAction {
  switch (reason) {
    case "outcome-unresolved":
      return "reconcile";
    case "attempts-exhausted":
    case "permanent-failure":
      return "retry";
    case "abandoned-by-operator":
      throw new RangeError(
        "Un destino abandonado no genera una alerta abierta.",
      );
  }
}

export function manualActionForOperationalAlert(
  alert: Pick<
    PublicationOperationalAlertRecord,
    "cause" | "kind" | "safeAction"
  >,
): PublicationManualAction | undefined {
  if (alert.kind !== "publication-manual-action") return undefined;
  if (alert.safeAction === "reconcile") return "reconcile";
  if (alert.safeAction === "retry") return "retry";
  return undefined;
}

/**
 * Huella legible y acotada. Sólo usa IDs internos y códigos; es segura para un
 * índice único, auditoría y logs. El recurso es obligatorio por tipo, de modo
 * que una recurrencia no puede quedar escondida detrás de otra.
 */
export function publicationOperationalAlertFingerprint(input: {
  readonly kind: PublicationOperationalAlertKind;
  readonly metaConnectionId?: string;
  readonly publicationTargetId?: string;
  readonly scheduleOccurrenceId?: string;
}): string {
  const resource =
    input.kind === "connection-degraded"
      ? input.metaConnectionId
      : input.kind === "occurrence-stuck"
        ? input.scheduleOccurrenceId
        : input.publicationTargetId;
  if (resource === undefined || resource.length === 0) {
    throw new RangeError(`La alerta ${input.kind} necesita su recurso origen.`);
  }
  return `${input.kind}:${resource}`;
}
