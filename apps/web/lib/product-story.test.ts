import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyProductStoryDraft,
  productStoryDocument,
  productStoryFrames,
  saveProductStoryDraft,
} from "./product-story.ts";

const photo = {
  alt: "Guantes de trabajo",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
  focusX: 50,
  focusY: 50,
  zoom: 100,
};
const apiBaseUrl = "https://api.invalid/";

test("la historia de producto compone el documento que renderiza el motor", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    badge: "Oferta",
    category: "Seguridad industrial",
    frame: "etiqueta",
    items: ["Talles 8 al 11", "  ", "Palma reforzada"],
    photo: { ...photo, focusX: 100, focusY: 0, zoom: 140 },
    previousPrice: "$ 62.400",
    price: "$ 48.900",
    subtitle: "Con agarre reforzado",
    title: "Guantes de trabajo",
    validity: "Hasta el sábado",
  });

  assert.equal(preview.kind, "ready");
  const { document } = preview;
  assert.equal(document.layout, "historia-producto-etiqueta");
  assert.equal(document.content.price, "$ 48.900");
  assert.equal(document.content.previousPrice, "$ 62.400");
  // Un renglón en blanco no viaja: el motor rechaza una lista con huecos.
  assert.deepEqual(document.content.items, [
    "Talles 8 al 11",
    "Palma reforzada",
  ]);
  const [media] = document.media;
  assert.ok(media);
  assert.deepEqual(media.focus, { x: 100, y: 0 });
  assert.equal(media.zoom, 1.4);
});

test("sin foto o sin nombre la historia dice qué falta, en vez de componerse a medias", () => {
  assert.deepEqual(
    productStoryDocument({ ...emptyProductStoryDraft, title: "Manguera" }),
    { kind: "needs-photo" },
  );
  const sinNombre = productStoryDocument({ ...emptyProductStoryDraft, photo });
  assert.equal(sinNombre.kind, "blocked");
  assert.match(sinNombre.message, /nombre del producto/u);
});

test("un precio anterior sin precio nuevo no compara nada y no se dibuja", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    photo,
    previousPrice: "$ 62.400",
    title: "Caño IPS bicapa",
  });

  assert.equal(preview.kind, "ready");
  assert.equal(preview.document.content.price, undefined);
  assert.equal(preview.document.content.previousPrice, undefined);
});

test("cada marco de producto nombra un layout del motor", () => {
  for (const frame of productStoryFrames) {
    const preview = productStoryDocument({
      ...emptyProductStoryDraft,
      frame: frame.value,
      photo,
      title: "Machete Biassoni",
    });
    assert.equal(preview.kind, "ready");
    assert.equal(preview.document.layout, frame.layout);
  }
});

test("guardar manda la foto embebida con su encuadre y un caption sin precio", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls: { body: string; path: string }[] = [];
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({
      body: typeof init?.body === "string" ? init.body : "",
      path: url.pathname,
    });
    // La respuesta es la que devuelve la API de verdad: la publicación en la
    // raíz, con su revisión. Un doble inventado acá esconde el error real.
    return Promise.resolve(
      url.pathname === "/auth/csrf"
        ? Response.json({ csrfToken: "csrf-safe" })
        : Response.json({
            createdAt: "2026-09-21T22:03:14.531Z",
            id: "904729f9-07a2-46aa-9342-7f17e4a953cd",
            latestRevision: {
              id: "6f0b6a71-0a3d-4f9d-9a1e-2d6f2f7b1c44",
              revisionNumber: 1,
            },
            status: "draft",
            title: "Guantes de trabajo",
            updatedAt: "2026-09-21T22:03:14.531Z",
            version: 1,
          }),
    );
  };

  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    photo: { ...photo, focusY: 30, zoom: 120 },
    price: "$ 48.900",
    title: "Guantes de trabajo",
  });
  assert.equal(preview.kind, "ready");
  const result = await saveProductStoryDraft(apiBaseUrl, {
    caption: "Pasá por el local y probátelos.",
    document: preview.document,
    idempotencyKey: "producto-1",
    title: "Guantes de trabajo",
  });

  assert.deepEqual(result, { kind: "saved", title: "Guantes de trabajo" });
  const saveCall = calls[1];
  assert.ok(saveCall);
  assert.equal(saveCall.path, "/publications");
  const body = JSON.parse(saveCall.body) as {
    content: { caption: string };
    design: {
      layout: string;
      media: {
        dataUrl: string;
        focus: { x: number; y: number };
        zoom: number;
      }[];
    };
  };
  assert.equal(body.design.layout, "historia-producto-precio-abajo");
  const [savedMedia] = body.design.media;
  assert.ok(savedMedia);
  assert.equal(savedMedia.dataUrl, photo.dataUrl);
  assert.deepEqual(savedMedia.focus, { x: 50, y: 30 });
  assert.equal(savedMedia.zoom, 1.2);
  // El precio vive en la pieza: el caption no lo repite.
  assert.doesNotMatch(body.content.caption, /\$/u);
});
