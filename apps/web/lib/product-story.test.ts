import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyProductStoryDraft,
  frameShows,
  productFrameThumbnail,
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

test("la pieza de producto compone el documento que renderiza el motor", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    badge: "Oferta",
    frame: "cartel",
    items: ["1 1/4″", "  ", "1 1/2″"],
    photo: { ...photo, focusX: 100, focusY: 0, zoom: 140 },
    previousPrice: "$ 4.100",
    price: "$ 3.200",
    priceUnit: "el metro",
    subtitle: "Flexible, no se aplasta",
    title: "Manguera corrugada",
    validity: "Hasta el sábado",
  });

  assert.equal(preview.kind, "ready");
  const { document } = preview;
  assert.equal(document.layout, "foto-producto-cartel");
  assert.equal(document.format, "historia");
  assert.equal(document.theme, "taller");
  assert.equal(document.content.price, "$ 3.200");
  assert.equal(document.content.previousPrice, "$ 4.100");
  assert.equal(document.content.priceUnit, "el metro");
  assert.equal(document.content.callToAction, "Consultanos por WhatsApp");
  assert.equal(document.content.hidden, undefined);
  // Un renglón en blanco no viaja: el motor rechaza una lista con huecos.
  assert.deepEqual(document.content.items, ["1 1/4″", "1 1/2″"]);
  const [media] = document.media;
  assert.ok(media);
  assert.deepEqual(media.focus, { x: 100, y: 0 });
  assert.equal(media.zoom, 1.4);
});

test("el mismo borrador sale como post y con el cartel del lubricentro", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    brand: "lubricentro",
    format: "feed",
    photo,
    priceMode: "consult",
    title: "Filtros Wega",
  });

  assert.equal(preview.kind, "ready");
  assert.equal(preview.document.format, "feed");
  assert.equal(preview.document.theme, "lubricentro");
});

test("sin foto, sin nombre o sin importe la pieza dice qué falta", () => {
  assert.deepEqual(
    productStoryDocument({ ...emptyProductStoryDraft, title: "Manguera" }),
    { kind: "needs-photo" },
  );
  const sinNombre = productStoryDocument({ ...emptyProductStoryDraft, photo });
  assert.equal(sinNombre.kind, "blocked");
  assert.match(sinNombre.message, /nombre del producto/u);
  // «Mostrar el precio» sin importe no se completa solo con «Consultá».
  const sinImporte = productStoryDocument({
    ...emptyProductStoryDraft,
    photo,
    title: "Manguera",
  });
  assert.equal(sinImporte.kind, "blocked");
  assert.match(sinImporte.message, /precio/u);
});

test("callar el nombre y el precio viaja como pedido explícito", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    photo,
    price: "$ 3.200",
    previousPrice: "$ 4.100",
    priceMode: "none",
    showButton: false,
    showTitle: false,
    title: "Manguera corrugada",
  });

  assert.equal(preview.kind, "ready");
  const { content } = preview.document;
  assert.deepEqual(content.hidden, ["title", "price"]);
  // El nombre sigue identificando el borrador aunque no se dibuje.
  assert.equal(content.title, "Manguera corrugada");
  // El importe escrito antes de callarlo no viaja, ni su comparación.
  assert.equal(content.price, undefined);
  assert.equal(content.previousPrice, undefined);
  assert.equal(content.callToAction, undefined);
});

test("«Consultá precio» no manda importe ni deja uno viejo escondido", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    photo,
    price: "$ 3.200",
    priceMode: "consult",
    priceUnit: "el metro",
    title: "Manguera corrugada",
  });

  assert.equal(preview.kind, "ready");
  assert.equal(preview.document.content.price, undefined);
  assert.equal(preview.document.content.priceUnit, undefined);
  assert.equal(preview.document.content.hidden, undefined);
});

test("un dato que el marco no dibuja no se guarda como si se publicara", () => {
  const preview = productStoryDocument({
    ...emptyProductStoryDraft,
    badge: "Oferta",
    frame: "libre",
    items: ["40", "50"],
    photo,
    price: "$ 850",
    subtitle: "Para caño de PVC",
    title: "Tapas de PVC",
    validity: "Hasta el sábado",
  });

  assert.equal(preview.kind, "ready");
  const { content } = preview.document;
  assert.equal(frameShows("libre", "subtitle"), false);
  assert.equal(content.subtitle, undefined);
  assert.equal(content.badge, undefined);
  assert.equal(content.items, undefined);
  assert.equal(content.validity, undefined);
  assert.equal(content.price, "$ 850");
});

test("cada marco de producto nombra un layout del motor en los dos formatos", () => {
  for (const frame of productStoryFrames) {
    for (const format of ["feed", "historia"] as const) {
      const preview = productStoryDocument({
        ...emptyProductStoryDraft,
        format,
        frame: frame.value,
        photo,
        priceMode: "consult",
        title: "Machete Biassoni",
      });
      assert.equal(preview.kind, "ready", `${frame.value} ${format}`);
      assert.equal(preview.document.layout, frame.layout);
    }
  }
});

test("la galería muestra cada marco aunque todavía no haya foto", () => {
  for (const frame of productStoryFrames) {
    const sample = productFrameThumbnail(emptyProductStoryDraft, frame.value);
    assert.ok(sample, frame.value);
    assert.equal(sample.layout, frame.layout);

    const own = productFrameThumbnail(
      { ...emptyProductStoryDraft, photo, priceMode: "consult", title: "Pala" },
      frame.value,
    );
    assert.ok(own, frame.value);
    assert.equal(own.content.title, "Pala");
    assert.equal(own.media[0]?.reference.source, "inline");
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

  assert.deepEqual(result, {
    kind: "saved",
    publication: {
      id: "904729f9-07a2-46aa-9342-7f17e4a953cd",
      title: "Guantes de trabajo",
    },
  });
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
  assert.equal(body.design.layout, "foto-producto-cartel");
  const [savedMedia] = body.design.media;
  assert.ok(savedMedia);
  assert.equal(savedMedia.dataUrl, photo.dataUrl);
  assert.deepEqual(savedMedia.focus, { x: 50, y: 30 });
  assert.equal(savedMedia.zoom, 1.2);
  // El precio vive en la pieza: el caption no lo repite.
  assert.doesNotMatch(body.content.caption, /\$/u);
});
