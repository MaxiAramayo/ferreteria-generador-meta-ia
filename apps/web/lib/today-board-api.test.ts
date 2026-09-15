import assert from "node:assert/strict";
import test from "node:test";

import {
  countPublications,
  countPublicationsNeedingAttention,
  loadPublicationTitles,
} from "./today-board-api.ts";

const apiBaseUrl = "https://api.example.invalid/";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

test("contar piezas pide una sola fila del estado y usa el total", async () => {
  const originalFetch = globalThis.fetch;
  const urls: URL[] = [];
  try {
    globalThis.fetch = (input) => {
      urls.push(requestUrl(input));
      return Promise.resolve(json({ items: [], limit: 1, page: 1, total: 7 }));
    };
    assert.deepEqual(await countPublications(apiBaseUrl, "ready_for_review"), {
      kind: "ready",
      value: 7,
    });
    const countUrl = urls[0];
    assert.ok(countUrl !== undefined);
    assert.equal(countUrl.pathname, "/publications");
    assert.equal(countUrl.searchParams.get("status"), "ready_for_review");
    assert.equal(countUrl.searchParams.get("limit"), "1");

    globalThis.fetch = () => Promise.resolve(json({ total: "7" }));
    assert.equal((await countPublications(apiBaseUrl, "draft")).kind, "error");

    globalThis.fetch = () => Promise.resolve(json({ message: "no" }, 403));
    assert.deepEqual(await countPublications(apiBaseUrl, "draft"), {
      kind: "error",
      message: "Tu sesión no puede leer estas piezas.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("las piezas con problemas suman tres estados y un fallo no vale cero", async () => {
  const originalFetch = globalThis.fetch;
  const totals: Readonly<Record<string, number>> = {
    generation_failed: 0,
    missing_information: 2,
    validation_failed: 1,
  };
  try {
    globalThis.fetch = (input) => {
      const status = requestUrl(input).searchParams.get("status") ?? "";
      return Promise.resolve(json({ total: totals[status] }));
    };
    assert.deepEqual(await countPublicationsNeedingAttention(apiBaseUrl), {
      kind: "ready",
      value: 3,
    });

    globalThis.fetch = (input) =>
      Promise.resolve(
        requestUrl(input).searchParams.get("status") === "validation_failed"
          ? json({ message: "falló" }, 500)
          : json({ total: 4 }),
      );
    assert.equal(
      (await countPublicationsNeedingAttention(apiBaseUrl)).kind,
      "error",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("los títulos ignoran filas incompletas y una API caída no rompe nada", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () =>
      Promise.resolve(
        json({
          items: [
            { id: "publication-1", title: "Aceite PITTS 5W40" },
            { id: 3, title: "Sin id válido" },
            { id: "publication-2" },
          ],
        }),
      );
    const titles = await loadPublicationTitles(apiBaseUrl);
    assert.equal(titles.size, 1);
    assert.equal(titles.get("publication-1"), "Aceite PITTS 5W40");

    globalThis.fetch = () => Promise.reject(new Error("sin red"));
    assert.equal((await loadPublicationTitles(apiBaseUrl)).size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
