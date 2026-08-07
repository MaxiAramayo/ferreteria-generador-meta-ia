import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPOSED_TITLE_BUDGET,
  composedPanelRect,
  FORMAT_IDS,
  FORMATS,
  parseDesignDocument,
  type ComposedRegion,
} from "@aramayo/design-engine";
import {
  composedTitleBudget,
  composedLayoutFor,
  reservedRectangleFor,
  VisualCompositionError,
  visualReservedSpaces,
  type ContentBrief,
} from "@aramayo/domain";

import { composePiece } from "./piece-composer.ts";
import { canvasFor } from "./visual-prompt-builder.ts";

/**
 * El compositor es el otro extremo del lazo que abrió `P4-T01`: el prompt le
 * pidió al modelo dejar libre un rectángulo, y acá se comprueba que la capa
 * determinista caiga exactamente sobre ese rectángulo, que el documento sea
 * válido para el motor y que un pedido imposible falle antes de gastar.
 */

const brief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Reservalo por WhatsApp",
  }),
  caption: "Pasá por el local y consultanos cuál te sirve para tu trabajo.",
  creativeProposal: "Tono directo, foco en el uso real de la herramienta.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "C1",
      externalProductId: "odoo-product-101",
      label: "Perforadora percutora 650 W",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: null,
  title: "Perforadora para tu obra",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "price" as const,
      evidenceId: "C1",
      statement: "La perforadora cuesta $ 24.500 en mostrador.",
    }),
  ]),
  visualDirection: "clean_product",
});

/** Base de un píxel: alcanza para probar el embebido y el recorte. */
const basePng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const base = {
  bytes: basePng,
  height: 1536,
  mimeType: "image/png",
  sha256: "a".repeat(64),
  width: 1024,
};

test("la geometría del motor y la del dominio describen el mismo rectángulo", () => {
  // Están declaradas por separado porque el motor no depende del dominio ni el
  // dominio del motor. Si alguien cambia una sola, esta prueba falla.
  const engineRegions: readonly ComposedRegion[] = [
    "upper_band",
    "lower_third",
    "center_circle",
  ];

  for (const region of engineRegions) {
    for (const formatId of FORMAT_IDS) {
      assert.deepEqual(
        composedPanelRect(region, FORMATS[formatId]),
        reservedRectangleFor(region, canvasFor(formatId)),
        `El rectángulo de ${region} en ${formatId} no coincide entre motor y dominio.`,
      );
    }
  }
});

test("los presupuestos de titular coinciden entre motor y dominio", () => {
  for (const region of visualReservedSpaces) {
    const layout = composedLayoutFor(region);

    if (layout === null) {
      continue;
    }

    assert.equal(
      composedTitleBudget[layout],
      COMPOSED_TITLE_BUDGET[region as ComposedRegion],
      `El presupuesto de ${region} no coincide entre motor y dominio.`,
    );
  }
});

test("la pieza compuesta produce un documento que el motor acepta", () => {
  const piece = composePiece({
    base,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });

  // No basta con que el objeto tenga la forma: se valida con la misma puerta que
  // usa el render, así que un documento que el motor rechazaría no pasa.
  const parsed = parseDesignDocument(piece.document);
  assert.equal(parsed.ok, true);

  assert.equal(piece.document.layout, "composicion-tercio-inferior");
  assert.equal(piece.document.format, "feed");
  assert.equal(piece.document.theme, "taller");
  assert.equal(piece.document.content.title, "Perforadora para tu obra");
  assert.equal(piece.document.content.price, "$ 24.500");
  assert.equal(piece.document.content.callToAction, "Reservalo por WhatsApp");
});

test("la base viaja embebida y no como URL", () => {
  const piece = composePiece({
    base,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });
  const reference = piece.document.media[0]?.reference;

  assert.ok(reference !== undefined);
  assert.equal(reference.source, "inline");
  assert.ok(reference.dataUrl.startsWith("data:image/png;base64,"));
  // El texto alternativo describe la imagen; el copy comercial es texto y va en
  // la capa determinista, no en el alternativo.
  assert.match(piece.document.media[0]?.alt ?? "", /Perforadora/u);
  assert.ok(!(piece.document.media[0]?.alt ?? "").includes("24.500"));
});

test("el recorte sube el encuadre cuando el panel va abajo", () => {
  const piece = composePiece({
    base,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });
  const media = piece.document.media[0];

  assert.ok(media !== undefined);
  assert.equal(media.fit, "cover");
  assert.equal(media.zoom, 1);
  assert.ok(media.focus.y < 50);
});

test("sin base la pieza se compone igual y no lleva medios", () => {
  const piece = composePiece({
    base: null,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });

  assert.equal(piece.document.media.length, 0);
  assert.equal(piece.snapshot.baseSha256, null);
  // El documento sigue siendo válido: una pieza determinista no es una pieza
  // incompleta.
  assert.equal(parseDesignDocument(piece.document).ok, true);
});

test("la huella separa la pieza entera de su capa determinista", () => {
  const withBase = composePiece({
    base,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });
  const otherBase = composePiece({
    base: { ...base, sha256: "b".repeat(64) },
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });

  // Dos bases distintas dan piezas distintas...
  assert.notEqual(
    withBase.snapshot.compositionHash,
    otherBase.snapshot.compositionHash,
  );
  // ...pero la misma capa de marca, que es lo que permite comparar variantes.
  assert.equal(withBase.snapshot.overlayHash, otherBase.snapshot.overlayHash);
  // El precio queda ligado a la evidencia que lo sustenta.
  assert.equal(withBase.snapshot.priceEvidenceId, "C1");
});

test("componer dos veces lo mismo da exactamente el mismo documento", () => {
  const first = composePiece({
    base,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });
  const second = composePiece({
    base,
    brief,
    format: "feed",
    region: "lower_third",
    slug: "composicion-prueba",
  });

  assert.deepEqual(first.document, second.document);
  assert.deepEqual(first.snapshot, second.snapshot);
});

test("la banda superior no compone precio aunque el brief lo sustente", () => {
  const piece = composePiece({
    base,
    brief,
    format: "feed",
    region: "upper_band",
    slug: "composicion-prueba",
  });

  assert.equal(piece.document.layout, "composicion-banda-superior");
  assert.equal(piece.document.content.price, undefined);
  assert.equal(parseDesignDocument(piece.document).ok, true);
});

test("un pedido que no se puede componer falla antes de producir nada", () => {
  assert.throws(
    () =>
      composePiece({
        base,
        brief,
        format: "feed",
        region: "left_column",
        slug: "composicion-prueba",
      }),
    (error: unknown) =>
      error instanceof VisualCompositionError &&
      error.code === "region-without-layout",
  );

  assert.throws(
    () =>
      composePiece({
        base,
        brief,
        format: "banner-fb",
        region: "lower_third",
        slug: "composicion-prueba",
      }),
    (error: unknown) =>
      error instanceof VisualCompositionError &&
      error.code === "format-not-composable",
  );
});

test("una base de un tipo que el documento no sabe embeber se rechaza", () => {
  assert.throws(
    () =>
      composePiece({
        base: { ...base, mimeType: "image/webp" },
        brief,
        format: "feed",
        region: "lower_third",
        slug: "composicion-prueba",
      }),
    (error: unknown) => error instanceof VisualCompositionError,
  );
});
