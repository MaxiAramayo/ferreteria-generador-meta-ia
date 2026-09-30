import assert from "node:assert/strict";
import test from "node:test";

import {
  editableProductPiece,
  emptyProductStoryDraft,
  frameShows,
  productFrameThumbnail,
  productPreviewNote,
  productStoryDocument,
  productStoryFrames,
  productStoryLivePreview,
  sampleProductPrice,
  sampleProductTitle,
  saveProductStoryDraft,
  usesExtraFields,
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

test("la vista previa muestra la pieza antes de cargar nada, con un ejemplo avisado", () => {
  const preview = productStoryLivePreview(emptyProductStoryDraft);

  assert.equal(preview.kind, "ready");
  assert.deepEqual(preview.samples, ["photo", "title", "price"]);
  assert.equal(preview.document.layout, "foto-producto-cartel");
  assert.equal(preview.document.content.title, sampleProductTitle);
  assert.equal(preview.document.content.price, sampleProductPrice);
  assert.equal(preview.document.media[0]?.reference.source, "brand-library");
  // El ejemplo es sólo para mirar: la pieza que se guarda sigue sin existir.
  assert.deepEqual(productStoryDocument(emptyProductStoryDraft), {
    kind: "needs-photo",
  });
});

test("con la foto subida, la vista previa ya la usa aunque falten nombre y precio", () => {
  const draft = { ...emptyProductStoryDraft, photo };
  const preview = productStoryLivePreview(draft);

  assert.equal(preview.kind, "ready");
  assert.deepEqual(preview.samples, ["title", "price"]);
  assert.equal(preview.document.media[0]?.reference.source, "inline");
  assert.equal(productStoryDocument(draft).kind, "blocked");
  // La galería tampoco espera: cada marco muestra la foto propia.
  for (const frame of productStoryFrames) {
    const thumbnail = productFrameThumbnail(draft, frame.value);
    assert.equal(thumbnail?.media[0]?.reference.source, "inline", frame.value);
  }
});

test("el ejemplo sólo cubre lo que falta y lo que la pieza dibuja", () => {
  const titled = productStoryLivePreview({
    ...emptyProductStoryDraft,
    photo,
    title: "Manguera",
  });
  assert.equal(titled.kind, "ready");
  assert.deepEqual(titled.samples, ["price"]);
  assert.equal(titled.document.content.title, "Manguera");

  // «Consultá precio» no lleva importe: no hay nada que completar.
  const consult = productStoryLivePreview({
    ...emptyProductStoryDraft,
    photo,
    priceMode: "consult",
  });
  assert.equal(consult.kind, "ready");
  assert.deepEqual(consult.samples, ["title"]);
  assert.equal(consult.document.content.price, undefined);

  // Un nombre callado no se ve, así que no se avisa como ejemplo.
  const hiddenTitle = productStoryLivePreview({
    ...emptyProductStoryDraft,
    photo,
    priceMode: "none",
    showTitle: false,
  });
  assert.equal(hiddenTitle.kind, "ready");
  assert.deepEqual(hiddenTitle.samples, []);
  assert.deepEqual(hiddenTitle.document.content.hidden, ["title", "price"]);
  // Guardar igual pide el nombre: identifica el borrador.
  assert.equal(
    productStoryDocument({
      ...emptyProductStoryDraft,
      photo,
      priceMode: "none",
      showTitle: false,
    }).kind,
    "blocked",
  );
});

test("completa, la vista previa es exactamente la pieza que se guarda", () => {
  const draft = {
    ...emptyProductStoryDraft,
    photo,
    price: "$ 3.200",
    title: "Manguera corrugada",
  };
  const preview = productStoryLivePreview(draft);
  const saved = productStoryDocument(draft);

  assert.equal(preview.kind, "ready");
  assert.equal(saved.kind, "ready");
  assert.deepEqual(preview.samples, []);
  assert.deepEqual(preview.document, saved.document);
});

test("el aviso nombra lo que es de ejemplo, en el orden en que se carga", () => {
  assert.equal(productPreviewNote([]), null);
  assert.equal(
    productPreviewNote(["price"]),
    "Por ahora con precio de ejemplo.",
  );
  assert.equal(
    productPreviewNote(["price", "photo"]),
    "Por ahora con foto y precio de ejemplo.",
  );
  assert.equal(
    productPreviewNote(["photo", "title", "price"]),
    "Por ahora con foto, nombre y precio de ejemplo.",
  );
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

test("una pieza guardada se abre en el compositor y vuelve a ser la misma", () => {
  const original = productStoryDocument({
    ...emptyProductStoryDraft,
    badge: "Oferta",
    brand: "lubricentro",
    caption: "Consultanos por WhatsApp.",
    format: "feed",
    frame: "gondola-derecha",
    items: ["1 1/4″", "1 1/2″"],
    photo: { ...photo, focusX: 30, focusY: 70, zoom: 140 },
    previousPrice: "$ 4.100",
    price: "$ 3.200",
    priceUnit: "el metro",
    showTitle: false,
    title: "Manguera corrugada",
    validity: "Hasta el sábado",
  });
  assert.equal(original.kind, "ready");

  const piece = editableProductPiece({
    id: "904729f9-07a2-46aa-9342-7f17e4a953cd",
    latestRevision: {
      content: { caption: "Consultanos por WhatsApp.", products: [] },
      designDocument: original.document,
    },
    status: "ready_for_review",
    title: "Manguera corrugada",
    version: 3,
  });
  assert.ok(piece);
  assert.equal(piece.status, "ready_for_review");
  assert.equal(piece.version, 3);
  assert.equal(piece.draft.frame, "gondola-derecha");
  assert.equal(piece.draft.brand, "lubricentro");
  assert.equal(piece.draft.priceMode, "amount");
  assert.equal(piece.draft.showTitle, false);

  const reopened = productStoryDocument(piece.draft);
  assert.equal(reopened.kind, "ready");
  assert.deepEqual(reopened.document, original.document);
});

test("callar el precio y apagar el botón también vuelven al abrir la pieza", () => {
  const original = productStoryDocument({
    ...emptyProductStoryDraft,
    photo,
    priceMode: "none",
    showButton: false,
    title: "Tapas de PVC",
  });
  assert.equal(original.kind, "ready");
  const piece = editableProductPiece({
    id: "p-2",
    latestRevision: {
      content: { caption: "", products: [] },
      designDocument: original.document,
    },
    status: "draft",
    version: 1,
  });
  assert.ok(piece);
  assert.equal(piece.draft.priceMode, "none");
  assert.equal(piece.draft.showButton, false);
  assert.equal(piece.draft.caption, "");
});

test("una pieza que no es de producto con foto propia no se abre acá", () => {
  assert.equal(
    editableProductPiece({
      id: "p-3",
      latestRevision: {
        content: { caption: "Hola", products: [] },
        designDocument: {
          content: { title: "Consejo" },
          format: "historia",
          layout: "historia-tip",
          media: [],
          schemaVersion: 1,
          slug: "consejo",
          theme: "taller",
        },
      },
      status: "draft",
      version: 1,
    }),
    null,
  );
});

test("«Más datos» se abre solo cuando la pieza ya usa alguno", () => {
  assert.equal(usesExtraFields(emptyProductStoryDraft), false);
  // Nombre, descripción y precio están siempre a la vista: no cuentan.
  assert.equal(
    usesExtraFields({
      ...emptyProductStoryDraft,
      price: "$ 18.500",
      subtitle: "Suela antideslizante",
      title: "Botas de PVC",
    }),
    false,
  );
  assert.equal(
    usesExtraFields({ ...emptyProductStoryDraft, validity: "Hasta el sábado" }),
    true,
  );
  assert.equal(
    usesExtraFields({ ...emptyProductStoryDraft, items: ["", "40 mm"] }),
    true,
  );
  assert.equal(
    usesExtraFields({ ...emptyProductStoryDraft, showButton: false }),
    true,
  );
  assert.equal(
    usesExtraFields({ ...emptyProductStoryDraft, callToAction: "Pedilo" }),
    true,
  );
});
