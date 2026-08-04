/**
 * Traducción de una ejecución del brief a lo que ve quien revisa.
 *
 * Vive separada del componente para poder probarse sin DOM: las reglas que
 * importan —cuándo se puede aceptar, qué se muestra primero, qué acciones
 * quedan habilitadas— son decisiones, no maquetado.
 */

import type {
  ContentBriefFact,
  ContentBriefMissingInformation,
  ContentBriefRunEvidenceResponse,
  ContentBriefRunResponse,
} from "@aramayo/contracts";

export type ContentBriefPhase =
  "cancelled" | "generating" | "ready" | "rejected" | "retrieving";

export interface ContentBriefUsageDisplay {
  readonly cost: string;
  readonly latency: string;
  readonly tokens: string;
}

export interface ContentBriefDisplay {
  /** Aceptar sólo tiene sentido sobre una ejecución que produjo brief. */
  readonly canAccept: boolean;
  readonly canCancel: boolean;
  readonly canRetry: boolean;
  readonly caption: string | null;
  readonly evidence: readonly ContentBriefRunEvidenceResponse[];
  readonly facts: readonly ContentBriefFact[];
  readonly headline: string;
  /**
   * Los faltantes se presentan antes del copy. Un brief con huecos declarados
   * ya obligó al modelo a pedir aprobación humana, así que esconderlos detrás
   * del texto invitaría a aceptarlo sin verlos.
   */
  readonly missingInformation: readonly ContentBriefMissingInformation[];
  readonly phase: ContentBriefPhase;
  readonly requiresHumanApproval: boolean;
  readonly statusLabel: string;
  readonly title: string | null;
  readonly usage: ContentBriefUsageDisplay;
}

const claimLabels: Readonly<Record<string, string>> = Object.freeze({
  availability: "disponibilidad",
  location: "sucursal",
  price: "precio",
  product_attribute: "atributo del producto",
  promotion: "promoción",
  service: "servicio",
  stock: "stock",
});

const missingKindLabels: Readonly<Record<string, string>> = Object.freeze({
  conflicting_sources: "las fuentes se contradicen",
  no_approved_source: "no hay fuente aprobada",
  stale_observation: "el dato consultado está vencido",
  tool_unavailable: "la herramienta no respondió",
});

export function claimLabel(claimKind: string): string {
  return claimLabels[claimKind] ?? claimKind;
}

export function missingInformationLabel(
  entry: ContentBriefMissingInformation,
): string {
  const reason = missingKindLabels[entry.kind] ?? entry.kind;
  return `Falta ${claimLabel(entry.subject)}: ${reason}.`;
}

/**
 * `knowledgeStatus` es un centinela mientras la ejecución no consultó nada.
 * Distinguirlo permite mostrar recuperación y generación como fases separadas
 * en lugar de un único “trabajando”.
 */
function pendingPhase(knowledgeStatus: string): ContentBriefPhase {
  return knowledgeStatus === "pending" ? "retrieving" : "generating";
}

function phaseOf(run: ContentBriefRunResponse): ContentBriefPhase {
  switch (run.status) {
    case "pending":
      return pendingPhase(run.knowledgeStatus);
    case "generated":
      return "ready";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
  }
}

function statusLabelOf(
  run: ContentBriefRunResponse,
  phase: ContentBriefPhase,
): string {
  switch (phase) {
    case "retrieving":
      return "Recuperando evidencia aprobada…";
    case "generating":
      return "Generando el brief con la evidencia recuperada…";
    case "ready":
      return "Brief generado y validado contra su evidencia.";
    case "cancelled":
      return "Cancelaste esta generación; su resultado no quedó vigente.";
    case "rejected":
      return run.rejection === null
        ? "La generación no produjo un brief."
        : run.rejection.message;
  }
}

function costLabel(estimatedCostUsd: number | null): string {
  return estimatedCostUsd === null
    ? "Costo no informado"
    : `US$ ${estimatedCostUsd.toFixed(4)}`;
}

function latencyLabel(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${String(milliseconds)} ms`
    : `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function contentBriefUsageDisplay(
  run: ContentBriefRunResponse,
): ContentBriefUsageDisplay {
  return Object.freeze({
    cost: costLabel(run.usage.estimatedCostUsd),
    latency: latencyLabel(run.usage.latencyMilliseconds),
    tokens: `${String(run.usage.totalTokens)} tokens`,
  });
}

export function contentBriefDisplay(
  run: ContentBriefRunResponse,
): ContentBriefDisplay {
  const phase = phaseOf(run);
  const brief = run.brief;
  return Object.freeze({
    // Que el estado sea `generated` no alcanza: lo que se acepta es el brief.
    canAccept: phase === "ready" && brief !== null,
    canCancel: phase === "retrieving" || phase === "generating",
    // Reintentar conserva el pedido y crea otra ejecución, así que sólo tiene
    // sentido cuando ésta ya no va a producir nada.
    canRetry: phase === "rejected" || phase === "cancelled",
    caption: brief?.caption ?? null,
    evidence: run.evidence,
    facts: brief?.verifiedFacts ?? [],
    headline: run.request,
    missingInformation: brief?.missingInformation ?? [],
    phase,
    requiresHumanApproval: brief?.requiresHumanApproval ?? false,
    statusLabel: statusLabelOf(run, phase),
    title: brief?.title ?? null,
    usage: contentBriefUsageDisplay(run),
  });
}

/** Una ejecución en curso es la única razón para volver a consultar. */
export function shouldPollContentBriefRun(
  run: ContentBriefRunResponse,
): boolean {
  return run.status === "pending";
}
