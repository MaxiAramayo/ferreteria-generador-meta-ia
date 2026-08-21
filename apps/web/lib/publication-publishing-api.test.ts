import assert from "node:assert/strict";
import test from "node:test";

import {
  applyManualAction,
  loadPendingManualActions,
  loadPublicationOrder,
  requestPublication,
} from "./publication-publishing-api.ts";

const apiBaseUrl = "http://localhost:3001";
const publicationId = "20000000-0000-4000-8000-000000000002";
const orderId = "60000000-0000-4000-8000-000000000006";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

/**
 * Reemplaza `fetch` anotando cada pedido. La primera llamada de una mutación es
 * siempre el CSRF, así que las respuestas se dan en orden.
 */
function stubFetch(
  responses: readonly (() => Response | Promise<Response>)[],
): Readonly<{ calls: Request[]; restore: () => void }> {
  const calls: Request[] = [];
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // El panel siempre pasa una `URL`; el tipo de `fetch` admite más formas y
    // cada una guarda la dirección en un lugar distinto.
    const url =
      input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : input;
    calls.push(new Request(url, init));
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return Promise.resolve(next?.() ?? json(null, 500));
  };
  return Object.freeze({
    calls,
    restore: (): void => {
      globalThis.fetch = originalFetch;
    },
  });
}

const csrfOk = (): Response => json({ csrfToken: "token-csrf" });

test("pedir la publicación manda la clave idempotente y los destinos elegidos", async () => {
  const stub = stubFetch([
    csrfOk,
    () =>
      json({
        orderId,
        publicationId,
        status: "publishing",
        version: 4,
      }),
  ]);
  try {
    const result = await requestPublication(
      apiBaseUrl,
      publicationId,
      3,
      ["instagram_feed", "facebook_page"],
      "clave-1",
    );

    assert.equal(result.kind, "accepted");
    assert.equal(result.order.orderId, orderId);

    const [, publish] = stub.calls;
    assert.ok(publish);
    // La clave viaja en el encabezado: es lo que hace que un doble envío
    // devuelva la orden del primero en vez de crear una segunda.
    assert.equal(publish.headers.get("idempotency-key"), "clave-1");
    assert.equal(publish.method, "POST");
    assert.match(publish.url, /publications\/.+\/publish$/u);
    assert.deepEqual(await publish.json(), {
      expectedVersion: 3,
      targets: ["instagram_feed", "facebook_page"],
    });
  } finally {
    stub.restore();
  }
});

test("un pedido sin respuesta queda indeterminado y no se declara fallido", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("La red se cayó."));
  try {
    const result = await requestPublication(
      apiBaseUrl,
      publicationId,
      3,
      ["facebook_page"],
      "clave-1",
    );

    // El pedido pudo haber llegado. Afirmar que falló sería inventar un
    // desenlace, y con una acción irreversible atrás.
    assert.equal(result.kind, "indeterminate");
    assert.match(result.message, /Recargá/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("una sesión sin permiso no llega a pedir la publicación", async () => {
  const stub = stubFetch([() => json({}, 403)]);
  try {
    const result = await requestPublication(
      apiBaseUrl,
      publicationId,
      3,
      ["facebook_page"],
      "clave-1",
    );
    assert.deepEqual(result, { kind: "forbidden" });
    // Se cortó en el CSRF: nunca se llamó a publicar.
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test("un rechazo conserva el motivo que dio la API", async () => {
  const stub = stubFetch([
    csrfOk,
    () =>
      json(
        { message: "La publicación cambió. Recargá antes de publicar." },
        409,
      ),
  ]);
  try {
    const result = await requestPublication(
      apiBaseUrl,
      publicationId,
      3,
      ["facebook_page"],
      "clave-1",
    );
    assert.equal(result.kind, "rejected");
    assert.equal(
      result.message,
      "La publicación cambió. Recargá antes de publicar.",
    );
  } finally {
    stub.restore();
  }
});

test("una respuesta con forma inesperada no se toma por orden aceptada", async () => {
  const stub = stubFetch([csrfOk, () => json({ orderId: 42 })]);
  try {
    const result = await requestPublication(
      apiBaseUrl,
      publicationId,
      3,
      ["facebook_page"],
      "clave-1",
    );
    assert.equal(result.kind, "rejected");
  } finally {
    stub.restore();
  }
});

test("la orden se lee sin caché para no mostrar un estado viejo", async () => {
  const stub = stubFetch([
    () =>
      json({
        createdAt: "2026-08-20T12:00:00.000Z",
        id: orderId,
        publicationId,
        status: "partially_published",
        targets: [
          { state: "published", target: "instagram_feed", updatedAt: "x" },
        ],
        updatedAt: "2026-08-20T12:05:00.000Z",
      }),
  ]);
  try {
    const result = await loadPublicationOrder(apiBaseUrl, orderId);
    assert.equal(result.kind, "ready");
    assert.equal(result.order.status, "partially_published");
  } finally {
    stub.restore();
  }
});

test("la lista de detenidos distingue falta de permiso de falla de lectura", async () => {
  const forbidden = stubFetch([() => json({}, 401)]);
  try {
    assert.deepEqual(await loadPendingManualActions(apiBaseUrl), {
      kind: "forbidden",
    });
  } finally {
    forbidden.restore();
  }

  const broken = stubFetch([() => json({ items: "no es una lista" })]);
  try {
    const result = await loadPendingManualActions(apiBaseUrl);
    assert.equal(result.kind, "error");
  } finally {
    broken.restore();
  }
});

test("aplicar una acción devuelve la lista ya actualizada", async () => {
  const stub = stubFetch([csrfOk, () => json({ items: [] })]);
  try {
    const result = await applyManualAction(
      apiBaseUrl,
      `${orderId}:facebook_page`,
      "abandon",
    );
    assert.equal(result.kind, "ready");
    assert.deepEqual([...result.items], []);

    const [, action] = stub.calls;
    assert.ok(action);
    assert.deepEqual(await action.json(), { action: "abandon" });
    // El identificador lleva dos puntos: tiene que viajar escapado.
    assert.match(action.url, /%3Afacebook_page\/actions$/u);
  } finally {
    stub.restore();
  }
});

test("una acción rechazada conserva el motivo de la API", async () => {
  const stub = stubFetch([
    csrfOk,
    () =>
      json(
        {
          message:
            "Esa acción no es segura para el motivo por el que el destino se detuvo.",
        },
        422,
      ),
  ]);
  try {
    const result = await applyManualAction(
      apiBaseUrl,
      `${orderId}:facebook_page`,
      "retry",
    );
    assert.equal(result.kind, "error");
    assert.match(result.message, /no es segura/u);
  } finally {
    stub.restore();
  }
});
