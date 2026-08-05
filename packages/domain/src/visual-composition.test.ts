import assert from "node:assert/strict";
import test from "node:test";

import {
  composedCopyFor,
  composedCropFor,
  composedLayoutFor,
  composedPieceFingerprint,
  composedThemeFor,
  composedTitleBudget,
  parseVerifiedAmount,
  planComposedPiece,
  verifiedPriceFor,
  verifiedValidityFor,
  visualCompositionVersion,
  VisualCompositionError,
  visualReservedSpaces,
  type ContentBrief,
  type ContentBriefFact,
  type VisualCanvas,
} from "./index.ts";

/**
 * La composición decide qué se le pone encima a la imagen generada. Lo que se
 * comprueba acá es que ese qué salga del brief y de su evidencia, que el
 * recorte no tape el producto y que un pedido imposible se rechace antes de
 * gastar una llamada al proveedor.
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
  verifiedFacts: Object.freeze([]),
  visualDirection: "clean_product",
});

function briefWith(overrides: Partial<ContentBrief>): ContentBrief {
  return Object.freeze({ ...brief, ...overrides });
}

/** Feed: 1080×1350 con zona segura de 72. */
const feedCanvas: VisualCanvas = Object.freeze({
  height: 1350,
  safeArea: Object.freeze({ bottom: 72, left: 72, right: 72, top: 72 }),
  width: 1080,
});

function fact(
  claimKind: "price" | "promotion",
  statement: string,
): ContentBriefFact {
  return Object.freeze({ claimKind, evidenceId: "C1", statement });
}

test("el importe se reconoce sólo cuando es inequívoco", () => {
  assert.equal(
    parseVerifiedAmount("La perforadora cuesta $ 24.500."),
    "$ 24.500",
  );
  assert.equal(parseVerifiedAmount("Sale $24500 en mostrador."), "$ 24500");
  assert.equal(parseVerifiedAmount("Precio ARS 32.000 con IVA."), "$ 32.000");

  // Dos importes en la misma oración no se resuelven adivinando cuál rige.
  assert.equal(parseVerifiedAmount("De $32.000 a $24.500 esta semana."), null);
  // Sin símbolo de moneda no hay precio: 650 es la potencia del taladro.
  assert.equal(parseVerifiedAmount("Perforadora de 650 W en stock."), null);
  assert.equal(parseVerifiedAmount("Consultá el precio en el local."), null);
});

test("el precio compuesto viene de un hecho verificado y conserva su evidencia", () => {
  const priced = briefWith({
    verifiedFacts: [fact("price", "La perforadora cuesta $ 24.500.")],
  });

  assert.deepEqual(verifiedPriceFor(priced), {
    amount: "$ 24.500",
    evidenceId: "C1",
  });

  // Un brief sin hecho de precio no compone precio: la pieza usa la invitación
  // a consultar, que es la decisión de negocio aprobada.
  assert.equal(verifiedPriceFor(brief), null);
});

test("dos hechos de precio con importes distintos no componen ninguno", () => {
  const contradictory = briefWith({
    verifiedFacts: [
      fact("price", "La perforadora cuesta $ 24.500."),
      fact("price", "La perforadora cuesta $ 27.900."),
    ],
  });

  assert.equal(verifiedPriceFor(contradictory), null);
});

test("la vigencia sólo se compone si el hecho la declara", () => {
  const withValidity = briefWith({
    verifiedFacts: [fact("promotion", "La oferta rige hasta el sábado 9.")],
  });
  const withoutValidity = briefWith({
    verifiedFacts: [fact("promotion", "Hay una promoción activa en el local.")],
  });

  assert.equal(verifiedValidityFor(withValidity), "hasta el sábado 9");
  assert.equal(verifiedValidityFor(withoutValidity), null);
});

test("cada región reservada tiene pieza, salvo la columna izquierda", () => {
  for (const region of visualReservedSpaces) {
    const layout = composedLayoutFor(region);

    if (region === "left_column") {
      assert.equal(layout, null);
      continue;
    }

    assert.ok(layout !== null, `La región ${region} no tiene pieza.`);
  }
});

test("la banda superior no compone precio y el tercio inferior sí", () => {
  const priced = briefWith({
    verifiedFacts: [fact("price", "La perforadora cuesta $ 24.500.")],
  });

  assert.equal(
    composedCopyFor(priced, "composicion-banda-superior").price,
    null,
  );
  assert.equal(
    composedCopyFor(priced, "composicion-tercio-inferior").price,
    "$ 24.500",
  );
});

test("la bajada se compone sólo cuando el titular deja lugar", () => {
  const short = briefWith({
    subtitle: "Con mecha y maletín.",
    title: "Perforadora",
  });
  const long = briefWith({
    subtitle: "Con mecha y maletín.",
    title: "Perforadora percutora de 650 vatios para obra y refacción",
  });

  assert.equal(
    composedCopyFor(short, "composicion-tercio-inferior").subtitle,
    "Con mecha y maletín.",
  );
  assert.equal(
    composedCopyFor(long, "composicion-tercio-inferior").subtitle,
    null,
  );
});

test("el tema sale de la marca y del objetivo del brief", () => {
  assert.equal(composedThemeFor(brief), "taller");
  assert.equal(
    composedThemeFor(briefWith({ objective: "promotion" })),
    "promo",
  );
  assert.equal(
    composedThemeFor(briefWith({ brand: "lubricentro" })),
    "lubricentro",
  );
  // La marca manda sobre el objetivo: una promoción del lubricentro sigue
  // siendo del lubricentro.
  assert.equal(
    composedThemeFor(
      briefWith({ brand: "lubricentro", objective: "promotion" }),
    ),
    "lubricentro",
  );
});

test("el recorte corre el encuadre en contra de la región reservada", () => {
  // La base del proveedor es 1024×1536: más alta que un feed de 1080×1350, así
  // que sobra alto y hay que decidir qué mitad se conserva.
  const base = { height: 1536, width: 1024 };
  const lower = composedCropFor("lower_third", base, feedCanvas);
  const upper = composedCropFor("upper_band", base, feedCanvas);

  assert.equal(lower.fit, "cover");
  assert.equal(lower.zoom, 1);
  // Panel abajo: el encuadre sube para dejar el producto en la mitad visible.
  assert.ok(
    lower.focusY < 50,
    `El foco debería subir y quedó en ${String(lower.focusY)}.`,
  );
  // Panel arriba: el encuadre baja.
  assert.ok(
    upper.focusY > 50,
    `El foco debería bajar y quedó en ${String(upper.focusY)}.`,
  );
});

test("una base sin sobrante no mueve el encuadre", () => {
  // Misma proporción que el lienzo: no hay nada que elegir.
  const crop = composedCropFor(
    "lower_third",
    { height: 1350, width: 1080 },
    feedCanvas,
  );

  assert.equal(crop.focusX, 50);
  assert.equal(crop.focusY, 50);
});

test("un sello central deja el foco en el medio", () => {
  const crop = composedCropFor(
    "center_circle",
    { height: 1536, width: 1024 },
    feedCanvas,
  );

  assert.equal(crop.focusX, 50);
  assert.equal(crop.focusY, 50);
});

test("un pedido que no se puede componer se rechaza antes de gastar", () => {
  const base = { height: 1536, width: 1024 };

  assert.throws(
    () =>
      planComposedPiece({
        base,
        brief,
        canvas: feedCanvas,
        format: "feed",
        region: "left_column",
      }),
    (error: unknown) =>
      error instanceof VisualCompositionError &&
      error.code === "region-without-layout",
  );

  assert.throws(
    () =>
      planComposedPiece({
        base,
        brief,
        canvas: feedCanvas,
        format: "banner-fb",
        region: "lower_third",
      }),
    (error: unknown) =>
      error instanceof VisualCompositionError &&
      error.code === "format-not-composable",
  );

  assert.throws(
    () =>
      planComposedPiece({
        base,
        brief: briefWith({
          title: "P".repeat(
            composedTitleBudget["composicion-banda-superior"] + 1,
          ),
        }),
        canvas: feedCanvas,
        format: "feed",
        region: "upper_band",
      }),
    (error: unknown) =>
      error instanceof VisualCompositionError &&
      error.code === "copy-too-long" &&
      error.correction.includes("56"),
  );
});

test("el plan queda ligado a su versión de reglas", () => {
  const plan = planComposedPiece({
    base: { height: 1536, width: 1024 },
    brief,
    canvas: feedCanvas,
    format: "feed",
    region: "lower_third",
  });

  assert.equal(plan.version, visualCompositionVersion);
  assert.equal(plan.layout, "composicion-tercio-inferior");
  assert.equal(plan.theme, "taller");
  assert.equal(plan.copy.callToAction, "Reservalo por WhatsApp");
});

test("la huella distingue dos composiciones que no son la misma pieza", () => {
  const plan = planComposedPiece({
    base: { height: 1536, width: 1024 },
    brief,
    canvas: feedCanvas,
    format: "feed",
    region: "lower_third",
  });
  const other = planComposedPiece({
    base: { height: 1536, width: 1024 },
    brief: briefWith({ title: "Perforadora para tu taller" }),
    canvas: feedCanvas,
    format: "feed",
    region: "lower_third",
  });

  assert.equal(
    composedPieceFingerprint(plan, "a".repeat(64)),
    composedPieceFingerprint(plan, "a".repeat(64)),
  );
  assert.notEqual(
    composedPieceFingerprint(plan, "a".repeat(64)),
    composedPieceFingerprint(plan, "b".repeat(64)),
  );
  assert.notEqual(
    composedPieceFingerprint(plan, "a".repeat(64)),
    composedPieceFingerprint(other, "a".repeat(64)),
  );
});
