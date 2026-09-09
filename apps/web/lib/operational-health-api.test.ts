import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { loadOperationalHealth } from "./operational-health-api.ts";

const apiBaseUrl = "https://api.example.invalid/";

const health = Object.freeze({
  generationBudgetPercent: 90,
  observedAt: "2026-09-09T15:00:00.000Z",
  reasons: [
    {
      code: "occurrence-delay",
      measured: 40,
      severity: "urgent",
      threshold: 30,
    },
  ],
  severity: "urgent",
  signals: {
    ambiguousTargets: 0,
    deadLetterMessages: 0,
    generationBudgetMicrousd: 10_000_000,
    generationCommittedMicrousd: 9_000_000,
    maximumOccurrenceDelayMinutes: 40,
    oldestPendingOutboxMinutes: 0,
    openAttentionAlerts: 0,
    openUrgentAlerts: 1,
    overdueOccurrences: 2,
    partialPublications: 0,
    pendingOutboxMessages: 3,
  },
});

function stub(context: TestContext, respond: () => Response): void {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () => Promise.resolve(respond());
}

test("el tablero llega tipado con sus motivos y señales", async (context) => {
  stub(context, () => Response.json(health));

  const result = await loadOperationalHealth(apiBaseUrl);

  assert.equal(result.kind, "ready");
  assert.equal(result.health.severity, "urgent");
  assert.deepEqual(result.health.reasons, health.reasons);
  assert.equal(result.health.signals.overdueOccurrences, 2);
});

test("un motivo desconocido invalida el tablero entero en vez de mostrarse a medias", async (context) => {
  stub(context, () =>
    Response.json({
      ...health,
      reasons: [{ ...health.reasons[0], code: "inventado" }],
    }),
  );

  assert.equal((await loadOperationalHealth(apiBaseUrl)).kind, "error");
});

test("una señal ausente o negativa no se completa con cero", async (context) => {
  stub(context, () =>
    Response.json({
      ...health,
      signals: { ...health.signals, overdueOccurrences: -1 },
    }),
  );

  assert.equal((await loadOperationalHealth(apiBaseUrl)).kind, "error");
});

test("sin permiso se distingue el rechazo de un error de red", async (context) => {
  stub(context, () => new Response(null, { status: 403 }));

  assert.deepEqual(await loadOperationalHealth(apiBaseUrl), {
    kind: "forbidden",
  });
});
