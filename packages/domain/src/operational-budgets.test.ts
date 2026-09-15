import assert from "node:assert/strict";
import test from "node:test";

import { operationalHealthThresholds } from "./operational-health.ts";
import {
  costBudgets,
  evaluateCostBudget,
  evaluateLatencyBudget,
  evaluateQueueBudget,
  latencyBudgets,
  queueBudgets,
  summarizeLatency,
} from "./operational-budgets.ts";

test("los percentiles salen del rango más cercano y no inventan valores", () => {
  const summary = summarizeLatency([50, 10, 30, 20, 40]);
  assert.deepEqual(summary, {
    count: 5,
    maximumMilliseconds: 50,
    p50Milliseconds: 30,
    p95Milliseconds: 50,
    p99Milliseconds: 50,
  });
  // Una sola muestra no puede presentarse como un percentil interpolado.
  assert.deepEqual(summarizeLatency([7]), {
    count: 1,
    maximumMilliseconds: 7,
    p50Milliseconds: 7,
    p95Milliseconds: 7,
    p99Milliseconds: 7,
  });
  assert.throws(() => summarizeLatency([]), /al menos una muestra/u);
});

test("una lectura dentro del presupuesto no reporta nada y una lenta dice cuánto", () => {
  const budget = latencyBudgets["api-session"];
  assert.deepEqual(
    evaluateLatencyBudget("api-session", {
      count: 20,
      maximumMilliseconds: budget.p99Milliseconds,
      p50Milliseconds: 10,
      p95Milliseconds: budget.p95Milliseconds,
      p99Milliseconds: budget.p99Milliseconds,
    }),
    [],
    "El presupuesto se cumple en el límite, no sólo por debajo.",
  );

  const breaches = evaluateLatencyBudget("api-session", {
    count: 20,
    maximumMilliseconds: 900,
    p50Milliseconds: 90,
    p95Milliseconds: budget.p95Milliseconds + 1,
    p99Milliseconds: budget.p99Milliseconds + 5,
  });
  assert.deepEqual(
    breaches.map((breach) => [breach.kind, breach.measured, breach.allowed]),
    [
      ["latency-p95", budget.p95Milliseconds + 1, budget.p95Milliseconds],
      ["latency-p99", budget.p99Milliseconds + 5, budget.p99Milliseconds],
    ],
  );
});

test("el presupuesto de cola es el umbral con el que el tablero ya pide atención", () => {
  assert.equal(
    queueBudgets["outbox-drain"].maximumPending,
    operationalHealthThresholds.outboxBacklogAttention,
  );
  assert.equal(
    queueBudgets["outbox-drain"].maximumAgeMinutes,
    operationalHealthThresholds.outboxAgeAttentionMinutes,
  );
  assert.equal(
    queueBudgets["occurrence-dispatch"].maximumPending,
    operationalHealthThresholds.occurrenceBacklogAttention,
  );

  assert.deepEqual(
    evaluateQueueBudget("outbox-drain", { ageMinutes: 0, pending: 0 }),
    [],
  );
  assert.deepEqual(
    evaluateQueueBudget("outbox-drain", { ageMinutes: 9, pending: 40 }).map(
      (breach) => breach.kind,
    ),
    ["queue-pending", "queue-age"],
  );
});

test("una pieza cuesta su brief más sus variantes, y el exceso dice cuánto", () => {
  const budget = costBudgets["publication-piece"];
  assert.deepEqual(
    evaluateCostBudget("publication-piece", budget.maximumMicrousd),
    [],
  );
  assert.deepEqual(
    evaluateCostBudget("publication-piece", budget.maximumMicrousd + 250),
    [
      {
        allowed: budget.maximumMicrousd,
        budget: budget.label,
        kind: "cost",
        measured: budget.maximumMicrousd + 250,
      },
    ],
  );
  assert.deepEqual(
    evaluateCostBudget(
      "content-brief",
      costBudgets["content-brief"].maximumMicrousd,
    ),
    [],
  );
});
