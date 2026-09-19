import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { DesignDocument } from "@aramayo/design-engine";

import {
  loadRecurringStoryDraft,
  saveRecurringStoryDraft,
} from "./recurring-story-draft-api.ts";

const originalFetch = globalThis.fetch;

const openingDocument = {
  content: {
    badge: "Estamos atendiendo",
    callToAction: "Consultanos por WhatsApp",
    items: ["Lun a sáb · 8:30 a 13:00"],
    title: "Ya abrimos",
  },
  format: "historia",
  layout: "historia-apertura-cartel",
  media: [],
  schemaVersion: 1,
  slug: "apertura-lunes",
  theme: "taller",
} satisfies DesignDocument;

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
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}

function publication(
  document: DesignDocument = openingDocument,
): Readonly<Record<string, unknown>> {
  return {
    id: "publication-1",
    latestRevision: {
      content: { caption: "Abrimos desde las 8:30." },
      designDocument: document,
    },
    locationId: "location-1",
    title: "Apertura del lunes",
    version: 2,
  };
}

test("carga sólo un borrador recurrente de apertura que el editor puede representar", async () => {
  globalThis.fetch = () => Promise.resolve(jsonResponse(publication()));

  const result = await loadRecurringStoryDraft(
    "http://api.example.test/",
    "publication-1",
  );

  assert.equal(result.kind, "ready");
  assert.equal(result.draft.designDocument.layout, "historia-apertura-cartel");
  assert.equal(result.draft.designDocument.theme, "taller");
});

test("no ofrece editar una pieza cuyo marco no pertenece a historias de apertura", async () => {
  globalThis.fetch = () =>
    Promise.resolve(
      jsonResponse({
        ...publication(),
        latestRevision: {
          content: { caption: "Consejo" },
          designDocument: { ...openingDocument, layout: "historia-tip" },
        },
      }),
    );

  const result = await loadRecurringStoryDraft(
    "http://api.example.test/",
    "publication-1",
  );

  assert.equal(result.kind, "error");
});

test("guardar crea una revisión con el documento editable y conserva el control de versión", async () => {
  let updateRequest: RequestInit | undefined;
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-safe" }));
    }
    updateRequest = init;
    return Promise.resolve(
      jsonResponse(publication({ ...openingDocument, theme: "promo" })),
    );
  };

  const loaded = await loadRecurringStoryDraft(
    "http://api.example.test/",
    "publication-1",
  );
  assert.equal(loaded.kind, "ready");

  const result = await saveRecurringStoryDraft("http://api.example.test/", {
    ...loaded.draft,
    designDocument: { ...loaded.draft.designDocument, theme: "promo" },
  });

  assert.equal(result.kind, "saved");
  assert.equal(
    new Headers(updateRequest?.headers).get("x-csrf-token"),
    "csrf-safe",
  );
  assert.equal(
    new Headers(updateRequest?.headers).get("idempotency-key") === null,
    false,
  );
  assert.equal(typeof updateRequest?.body, "string");
  if (typeof updateRequest?.body !== "string") {
    assert.fail("La edición debía enviar un documento de diseño.");
  }
  const body: unknown = JSON.parse(updateRequest.body);
  assert.deepEqual(body, {
    content: { caption: "Abrimos desde las 8:30.", products: [] },
    design: {
      ...openingDocument,
      media: [],
      theme: "promo",
    },
    expectedVersion: 2,
    locationId: "location-1",
    title: "Apertura del lunes",
  });
});

test("guardar conserva la foto del borrador por su origen", async () => {
  const withPhotos = {
    ...openingDocument,
    layout: "historia-apertura-imagen",
    media: [
      {
        alt: "Nuestra gata en el mostrador",
        fit: "cover",
        focus: { x: 50, y: 40 },
        reference: {
          dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
          source: "inline",
        },
        zoom: 1,
      },
    ],
  } satisfies DesignDocument;
  let updateRequest: RequestInit | undefined;
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-safe" }));
    }
    if (init?.method === "PATCH") updateRequest = init;
    return Promise.resolve(jsonResponse(publication(withPhotos)));
  };

  const loaded = await loadRecurringStoryDraft(
    "http://api.example.test/",
    "publication-1",
  );
  assert.equal(loaded.kind, "ready");
  const saved = await saveRecurringStoryDraft(
    "http://api.example.test/",
    loaded.draft,
  );
  assert.equal(saved.kind, "saved");
  if (typeof updateRequest?.body !== "string") {
    assert.fail("La edición debía enviar la foto.");
  }
  const body = JSON.parse(updateRequest.body) as {
    design: { media: unknown[] };
  };
  assert.deepEqual(body.design.media, [
    {
      alt: "Nuestra gata en el mostrador",
      dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
      fit: "cover",
      focus: { x: 50, y: 40 },
      zoom: 1,
    },
  ]);

  const withBrandPhoto = await saveRecurringStoryDraft(
    "http://api.example.test/",
    {
      ...loaded.draft,
      designDocument: {
        ...openingDocument,
        media: [
          {
            alt: "Pared de herramientas",
            fit: "cover",
            focus: { x: 50, y: 50 },
            reference: {
              assetId: "brand/interior-herramientas",
              source: "brand-library",
            },
            zoom: 1,
          },
        ],
      },
    },
  );
  assert.equal(withBrandPhoto.kind, "saved");
  if (typeof updateRequest.body !== "string") {
    assert.fail("La edición debía enviar la foto del local.");
  }
  assert.deepEqual(
    (JSON.parse(updateRequest.body) as { design: { media: unknown[] } }).design
      .media,
    [
      {
        alt: "Pared de herramientas",
        brandAssetId: "brand/interior-herramientas",
        fit: "cover",
        focus: { x: 50, y: 50 },
        zoom: 1,
      },
    ],
  );
});
