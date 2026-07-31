import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  acceptContentBrief,
  cancelContentBriefRun,
  loadContentBriefHistory,
  loadContentBriefRun,
  requestContentBrief,
} from "./content-brief-api.ts";

const originalFetch = globalThis.fetch;
const apiBaseUrl = "https://api.aramayo.invalid/";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  return new URL(typeof input === "string" ? input : input.url);
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

/** El cuerpo se captura dentro de un `fetch` falso, así que llega sin narrowing. */
function parseBody(body: string | null): unknown {
  return JSON.parse(body ?? "null");
}

const pendingRun = Object.freeze({
  brief: null,
  cancelledAt: null,
  completedAt: null,
  evidence: [],
  id: "run-1",
  knowledgeStatus: "pending",
  locationId: null,
  model: null,
  promptVersion: null,
  rejection: null,
  request: "Necesito una pieza para promocionar taladros.",
  requestedAt: "2026-07-31T12:00:00.000Z",
  schemaVersion: null,
  status: "pending",
  toolInvocations: [],
  usage: { estimatedCostUsd: null, latencyMilliseconds: 0, totalTokens: 0 },
});

test("pedir envía CSRF e idempotencia y devuelve la ejecución a consultar", async () => {
  let bodyText: string | null = null;
  let sentKey: string | null = null;
  let sentCsrf: string | null = null;
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-1" }));
    }
    bodyText = typeof init?.body === "string" ? init.body : null;
    sentKey = headerOf(init, "idempotency-key");
    sentCsrf = headerOf(init, "x-csrf-token");
    return Promise.resolve(
      jsonResponse({ runId: "run-1", status: "pending" }, 202),
    );
  };

  const result = await requestContentBrief(apiBaseUrl, {
    idempotencyKey: "key-1",
    locationId: "location-1",
    request: "Necesito una pieza para promocionar taladros.",
  });

  assert.deepEqual(result, { kind: "accepted", runId: "run-1" });
  assert.equal(sentKey, "key-1");
  assert.equal(sentCsrf, "csrf-1");
  assert.deepEqual(parseBody(bodyText), {
    locationId: "location-1",
    request: "Necesito una pieza para promocionar taladros.",
  });
});

test("un pedido sin sucursal no inventa el campo", async () => {
  let bodyText: string | null = null;
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-1" }));
    }
    bodyText = typeof init?.body === "string" ? init.body : null;
    return Promise.resolve(jsonResponse({ runId: "run-1" }, 202));
  };

  await requestContentBrief(apiBaseUrl, {
    idempotencyKey: "key-1",
    request: "Necesito una pieza para promocionar taladros.",
  });

  assert.deepEqual(parseBody(bodyText), {
    request: "Necesito una pieza para promocionar taladros.",
  });
});

test("una sesión sin CSRF no llega a pedir generación", async () => {
  const calledPaths: string[] = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    calledPaths.push(url.pathname);
    return Promise.resolve(jsonResponse({}, 401));
  };

  const result = await requestContentBrief(apiBaseUrl, {
    idempotencyKey: "key-1",
    request: "Necesito una pieza para promocionar taladros.",
  });

  assert.deepEqual(result, { kind: "forbidden" });
  assert.deepEqual(calledPaths, ["/auth/csrf"]);
});

test("la consulta acepta una ejecución pendiente sin prompt ni modelo", async () => {
  globalThis.fetch = () => Promise.resolve(jsonResponse(pendingRun));

  const result = await loadContentBriefRun(apiBaseUrl, "run-1");

  assert.ok(result.kind === "ready");
  assert.equal(result.run.status, "pending");
  assert.equal(result.run.promptVersion, null);
  assert.equal(result.run.model, null);
});

test("una ejecución con forma inesperada se informa en lugar de renderizarse", async () => {
  // Sin `usage` el panel mostraría costos indefinidos si confiara en el tipo.
  const withoutUsage: Readonly<Record<string, unknown>> = Object.fromEntries(
    Object.entries(pendingRun).filter(([key]) => key !== "usage"),
  );
  globalThis.fetch = () => Promise.resolve(jsonResponse(withoutUsage));

  const result = await loadContentBriefRun(apiBaseUrl, "run-1");

  assert.equal(result.kind, "error");
});

test("una evidencia con tipo desconocido invalida la ejecución completa", async () => {
  globalThis.fetch = () =>
    Promise.resolve(
      jsonResponse({
        ...pendingRun,
        evidence: [
          {
            citationId: "C1",
            kind: "inventado",
            observedAt: null,
            reference: "odoo:product:42",
          },
        ],
      }),
    );

  const result = await loadContentBriefRun(apiBaseUrl, "run-1");

  assert.equal(result.kind, "error");
});

test("el historial viaja con paginado y filtro de autor explícitos", async () => {
  let query = "";
  globalThis.fetch = (input) => {
    query = requestUrl(input).search;
    return Promise.resolve(
      jsonResponse({ items: [pendingRun], limit: 10, page: 2, total: 1 }),
    );
  };

  const result = await loadContentBriefHistory(apiBaseUrl, {
    limit: 10,
    mine: true,
    page: 2,
  });

  assert.equal(result.kind, "ready");
  assert.match(query, /limit=10/u);
  assert.match(query, /mine=true/u);
  assert.match(query, /page=2/u);
});

test("cancelar informa el estado real y no afirma haber cancelado", async () => {
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/csrf")
        ? jsonResponse({ csrfToken: "csrf-1" })
        : // La generación había terminado antes de que llegara la cancelación.
          jsonResponse({ runId: "run-1", status: "generated" }, 201),
    );
  };

  const result = await cancelContentBriefRun(apiBaseUrl, "run-1");

  assert.deepEqual(result, { kind: "resolved", status: "generated" });
});

test("aceptar envía el diseño y nunca el copy del brief", async () => {
  let bodyText: string | null = null;
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-1" }));
    }
    bodyText = typeof init?.body === "string" ? init.body : null;
    return Promise.resolve(
      jsonResponse({ id: "publication-1", title: "Taladro percutor" }, 201),
    );
  };

  const result = await acceptContentBrief(apiBaseUrl, {
    designTitle: "Taladro percutor para tu obra",
    idempotencyKey: "key-1",
    runId: "run-1",
  });

  assert.deepEqual(result, {
    kind: "accepted",
    publication: { id: "publication-1", title: "Taladro percutor" },
  });
  const sent: unknown = parseBody(bodyText);
  const body = sent as Readonly<Record<string, unknown>>;
  assert.deepEqual(Object.keys(body), ["design"]);
  assert.equal(
    (body["design"] as Readonly<{ content: Readonly<{ title: string }> }>)
      .content.title,
    "Taladro percutor para tu obra",
  );
});

test("aceptar una ejecución sin brief se distingue de un error transitorio", async () => {
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/csrf")
        ? jsonResponse({ csrfToken: "csrf-1" })
        : jsonResponse({ message: "conflict" }, 409),
    );
  };

  const result = await acceptContentBrief(apiBaseUrl, {
    designTitle: "Taladro percutor",
    idempotencyKey: "key-1",
    runId: "run-1",
  });

  // Un conflicto no se reintenta: la ejecución nunca va a producir un brief.
  assert.equal(result.kind, "conflict");
});

test("una API caída no se representa como acción confirmada", async () => {
  globalThis.fetch = () => Promise.reject(new Error("network"));

  const requested = await requestContentBrief(apiBaseUrl, {
    idempotencyKey: "key-1",
    request: "Necesito una pieza para promocionar taladros.",
  });
  const loaded = await loadContentBriefRun(apiBaseUrl, "run-1");

  assert.equal(requested.kind, "error");
  assert.equal(loaded.kind, "error");
});
