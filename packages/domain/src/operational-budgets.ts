import { operationalHealthThresholds } from "./operational-health.ts";

/**
 * Presupuestos de rendimiento y costo (`P7-T05`).
 *
 * Los números se fijan midiendo, no opinando: `pnpm budget:load` mide con datos
 * representativos y este módulo dice si lo medido entra. Viven en el dominio
 * porque la prueba de carga, el tablero y el runbook tienen que juzgar con el
 * mismo criterio; si cada uno eligiera el suyo, dos personas mirando el mismo
 * sistema discutirían si está bien.
 *
 * Los de cola no se declaran de nuevo: son los umbrales con los que la salud
 * operativa ya pide atención, y presupuestar por encima de ellos sería aceptar
 * como normal algo que el panel muestra en rojo.
 */

export const operationalBudgetsVersion = "operational-budgets/2026-09-15.2";

export type LatencyBudgetId =
  | "api-generation-run"
  | "api-operational-health"
  | "api-publication-list"
  | "api-schedule-calendar"
  | "api-session";

export interface LatencySummary {
  readonly count: number;
  readonly maximumMilliseconds: number;
  readonly p50Milliseconds: number;
  readonly p95Milliseconds: number;
  readonly p99Milliseconds: number;
}

export interface LatencyBudget {
  readonly id: LatencyBudgetId;
  readonly label: string;
  readonly p95Milliseconds: number;
  readonly p99Milliseconds: number;
}

export type QueueBudgetId = "occurrence-dispatch" | "outbox-drain";

export interface QueueBudget {
  readonly id: QueueBudgetId;
  readonly label: string;
  readonly maximumAgeMinutes: number;
  readonly maximumPending: number;
}

export type CostBudgetId =
  "content-brief" | "generation-variant" | "publication-piece";

export interface CostBudget {
  readonly id: CostBudgetId;
  readonly label: string;
  readonly maximumMicrousd: number;
}

export interface ListVolumeBudget {
  readonly defaultPageSize: number;
  readonly maximumPageSize: number;
  /** Volumen con el que se mide: el panel tiene que seguir paginando ahí. */
  readonly representativeRows: number;
}

export type BudgetBreachKind =
  "cost" | "latency-p95" | "latency-p99" | "queue-age" | "queue-pending";

export interface BudgetBreach {
  readonly allowed: number;
  readonly budget: string;
  readonly kind: BudgetBreachKind;
  readonly measured: number;
}

/**
 * Lecturas del panel. Cada una es una pantalla esperando: la sesión abre el
 * panel, el listado es la mesa de contenido, el calendario es Programación y la
 * salud operativa es el tablero de quien publica.
 *
 * Los números salen de medir con `pnpm budget:load` el 2026-09-15 contra el
 * PostgreSQL 17 del compose y 500 publicaciones: p95 entre 5 y 9 ms. El
 * presupuesto es unas diez veces eso, que tolera una máquina más lenta y
 * falla igual si una consulta se degrada un orden de magnitud.
 */
export const latencyBudgets: Readonly<Record<LatencyBudgetId, LatencyBudget>> =
  Object.freeze({
    "api-generation-run": Object.freeze({
      id: "api-generation-run",
      label: "Leer una ejecución de generación",
      p95Milliseconds: 80,
      p99Milliseconds: 160,
    }),
    "api-operational-health": Object.freeze({
      id: "api-operational-health",
      label: "Salud operativa",
      p95Milliseconds: 100,
      p99Milliseconds: 200,
    }),
    "api-publication-list": Object.freeze({
      id: "api-publication-list",
      label: "Listado de publicaciones",
      p95Milliseconds: 100,
      p99Milliseconds: 200,
    }),
    "api-schedule-calendar": Object.freeze({
      id: "api-schedule-calendar",
      label: "Calendario de programación",
      p95Milliseconds: 120,
      p99Milliseconds: 240,
    }),
    "api-session": Object.freeze({
      id: "api-session",
      label: "Sesión activa",
      p95Milliseconds: 60,
      p99Milliseconds: 120,
    }),
  });

export const queueBudgets: Readonly<Record<QueueBudgetId, QueueBudget>> =
  Object.freeze({
    "occurrence-dispatch": Object.freeze({
      id: "occurrence-dispatch",
      label: "Turnos vencidos sin despachar",
      maximumAgeMinutes:
        operationalHealthThresholds.occurrenceDelayAttentionMinutes,
      maximumPending: operationalHealthThresholds.occurrenceBacklogAttention,
    }),
    "outbox-drain": Object.freeze({
      id: "outbox-drain",
      label: "Avisos pendientes en el outbox",
      maximumAgeMinutes: operationalHealthThresholds.outboxAgeAttentionMinutes,
      maximumPending: operationalHealthThresholds.outboxBacklogAttention,
    }),
  });

/**
 * Costo por operación, en micro-USD. La pieza suma su brief y las variantes que
 * la produjeron: publicar no agrega gasto de IA, así que atribuirlo a la pieza
 * es atribuirlo entero.
 */
export const costBudgets: Readonly<Record<CostBudgetId, CostBudget>> =
  Object.freeze({
    "content-brief": Object.freeze({
      id: "content-brief",
      label: "Brief con evidencia",
      maximumMicrousd: 60_000,
    }),
    "generation-variant": Object.freeze({
      id: "generation-variant",
      label: "Variante generada",
      maximumMicrousd: 150_000,
    }),
    "publication-piece": Object.freeze({
      id: "publication-piece",
      label: "Pieza publicable, con su brief y sus variantes",
      maximumMicrousd: 250_000,
    }),
  });

export const listVolumeBudget: ListVolumeBudget = Object.freeze({
  defaultPageSize: 20,
  maximumPageSize: 100,
  representativeRows: 500,
});

/** Percentil por rango más cercano: con pocas muestras no inventa valores. */
function percentile(sorted: readonly number[], fraction: number): number {
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
  return sorted[index] ?? 0;
}

export function summarizeLatency(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) {
    throw new Error(
      "Un presupuesto de latencia necesita al menos una muestra.",
    );
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    count: sorted.length,
    maximumMilliseconds: sorted[sorted.length - 1] ?? 0,
    p50Milliseconds: percentile(sorted, 0.5),
    p95Milliseconds: percentile(sorted, 0.95),
    p99Milliseconds: percentile(sorted, 0.99),
  });
}

export function evaluateLatencyBudget(
  id: LatencyBudgetId,
  summary: LatencySummary,
): readonly BudgetBreach[] {
  const budget = latencyBudgets[id];
  const breaches: BudgetBreach[] = [];
  if (summary.p95Milliseconds > budget.p95Milliseconds) {
    breaches.push({
      allowed: budget.p95Milliseconds,
      budget: budget.label,
      kind: "latency-p95",
      measured: summary.p95Milliseconds,
    });
  }
  if (summary.p99Milliseconds > budget.p99Milliseconds) {
    breaches.push({
      allowed: budget.p99Milliseconds,
      budget: budget.label,
      kind: "latency-p99",
      measured: summary.p99Milliseconds,
    });
  }
  return breaches;
}

export function evaluateQueueBudget(
  id: QueueBudgetId,
  observation: Readonly<{ ageMinutes: number; pending: number }>,
): readonly BudgetBreach[] {
  const budget = queueBudgets[id];
  const breaches: BudgetBreach[] = [];
  if (observation.pending > budget.maximumPending) {
    breaches.push({
      allowed: budget.maximumPending,
      budget: budget.label,
      kind: "queue-pending",
      measured: observation.pending,
    });
  }
  if (observation.ageMinutes > budget.maximumAgeMinutes) {
    breaches.push({
      allowed: budget.maximumAgeMinutes,
      budget: budget.label,
      kind: "queue-age",
      measured: observation.ageMinutes,
    });
  }
  return breaches;
}

export function evaluateCostBudget(
  id: CostBudgetId,
  microusd: number,
): readonly BudgetBreach[] {
  const budget = costBudgets[id];
  return microusd > budget.maximumMicrousd
    ? [
        {
          allowed: budget.maximumMicrousd,
          budget: budget.label,
          kind: "cost",
          measured: microusd,
        },
      ]
    : [];
}
