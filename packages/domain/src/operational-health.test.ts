import assert from "node:assert/strict";
import test from "node:test";

import {
  operationalHealthThresholds,
  resolveOperationalHealth,
  type OperationalHealthSignals,
} from "./operational-health.ts";

const quiet: OperationalHealthSignals = {
  ambiguousTargets: 0,
  deadLetterMessages: 0,
  generationBudgetMicrousd: 10_000_000,
  generationCommittedMicrousd: 1_000_000,
  maximumOccurrenceDelayMinutes: 0,
  oldestPendingOutboxMinutes: 0,
  openAttentionAlerts: 0,
  openUrgentAlerts: 0,
  overdueOccurrences: 0,
  partialPublications: 0,
  pendingOutboxMessages: 0,
};

test("sin señales cruzadas el tablero informa salud y ningún motivo", () => {
  const report = resolveOperationalHealth(quiet);

  assert.equal(report.severity, "healthy");
  assert.deepEqual(report.reasons, []);
  assert.equal(report.generationBudgetPercent, 10);
});

test("una ocurrencia vencida llama la atención y cinco vuelven urgente el tablero", () => {
  assert.deepEqual(
    resolveOperationalHealth({ ...quiet, overdueOccurrences: 1 }).reasons,
    [
      {
        code: "occurrence-backlog",
        measured: 1,
        severity: "attention",
        threshold: operationalHealthThresholds.occurrenceBacklogAttention,
      },
    ],
  );
  const urgent = resolveOperationalHealth({
    ...quiet,
    overdueOccurrences: 5,
  });
  assert.equal(urgent.severity, "urgent");
  assert.equal(urgent.reasons[0]?.severity, "urgent");
});

test("el atraso, la antigüedad del outbox y el dead letter tienen umbral propio", () => {
  const delayed = resolveOperationalHealth({
    ...quiet,
    maximumOccurrenceDelayMinutes: 30,
    oldestPendingOutboxMinutes: 5,
  });
  assert.deepEqual(
    delayed.reasons.map((entry) => [entry.code, entry.severity]),
    [
      ["occurrence-delay", "urgent"],
      ["outbox-age", "attention"],
    ],
  );
  assert.equal(
    resolveOperationalHealth({ ...quiet, deadLetterMessages: 1 }).severity,
    "urgent",
  );
});

test("un desenlace indeterminado es urgente y una salida parcial pide revisión", () => {
  assert.equal(
    resolveOperationalHealth({ ...quiet, ambiguousTargets: 1 }).severity,
    "urgent",
  );
  const partial = resolveOperationalHealth({
    ...quiet,
    partialPublications: 2,
  });
  assert.equal(partial.severity, "attention");
  assert.equal(partial.reasons[0]?.code, "partial-publications");
});

test("el presupuesto de IA se mide en porcentaje y sin presupuesto no se inventa", () => {
  assert.equal(
    resolveOperationalHealth({
      ...quiet,
      generationCommittedMicrousd: 8_000_000,
    }).severity,
    "attention",
  );
  assert.equal(
    resolveOperationalHealth({
      ...quiet,
      generationCommittedMicrousd: 10_000_000,
    }).severity,
    "urgent",
  );
  const withoutBudget = resolveOperationalHealth({
    ...quiet,
    generationBudgetMicrousd: 0,
    generationCommittedMicrousd: 500_000,
  });
  assert.equal(withoutBudget.severity, "healthy");
  assert.equal(withoutBudget.generationBudgetPercent, 0);
});

test("una alerta abierta se refleja con la severidad que ya tiene en la bandeja", () => {
  assert.equal(
    resolveOperationalHealth({ ...quiet, openAttentionAlerts: 3 }).severity,
    "attention",
  );
  const urgent = resolveOperationalHealth({
    ...quiet,
    openAttentionAlerts: 3,
    openUrgentAlerts: 1,
  });
  assert.equal(urgent.severity, "urgent");
  assert.deepEqual(
    urgent.reasons.map((entry) => entry.code),
    ["open-alerts"],
  );
});
