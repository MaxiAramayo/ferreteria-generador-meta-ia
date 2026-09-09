import assert from "node:assert/strict";
import test from "node:test";

import {
  loadOperationalAlerts,
  resolveOperationalAlert,
} from "./publication-operational-alert-api.ts";

const apiBaseUrl = "http://localhost:3001";
const alert = Object.freeze({
  cause: "execution-not-completed",
  firstObservedAt: "2026-09-08T14:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000001",
  kind: "occurrence-stuck",
  lastObservedAt: "2026-09-08T14:05:00.000Z",
  observations: 2,
  publicationId: "00000000-0000-4000-8000-000000000002",
  publicationTarget: "instagram_feed",
  safeAction: "inspect-queue",
  scheduleOccurrenceId: "00000000-0000-4000-8000-000000000003",
  severity: "urgent",
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("proyecta alertas verificadas y nunca propaga campos inesperados", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(json({ items: [{ ...alert, providerPayload: "secret" }] }));
  try {
    const result = await loadOperationalAlerts(apiBaseUrl);
    assert.equal(result.kind, "ready");
    assert.deepEqual(result.alerts, [alert]);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rechaza una forma de alerta que no puede ser explicada con seguridad", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(json({ items: [{ id: alert.id }] }));
  try {
    const result = await loadOperationalAlerts(apiBaseUrl);
    assert.equal(result.kind, "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reconocer una alerta manda CSRF y no intenta reanudar publicación", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Readonly<{
    method: string;
    path: string;
    csrf: string | null;
  }>[] = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname === "/auth/csrf") {
      return Promise.resolve(json({ csrfToken: "csrf-safe" }));
    }
    calls.push({
      csrf: new Headers(init?.headers).get("x-csrf-token"),
      method: init?.method ?? "GET",
      path: url.pathname,
    });
    return Promise.resolve(json({ alert, status: "resolved" }));
  };
  try {
    const result = await resolveOperationalAlert(apiBaseUrl, alert.id);
    assert.equal(result.kind, "resolved");
    assert.deepEqual(calls, [
      {
        csrf: "csrf-safe",
        method: "POST",
        path: `/operational-alerts/${alert.id}/resolution`,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
