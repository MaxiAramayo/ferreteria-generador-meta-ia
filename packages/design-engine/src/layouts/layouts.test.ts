import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CATALOG_STATUS,
  catalogStatusFor,
  DESIGN_SCHEMA_VERSION,
  DesignEngineError,
  FORMATS,
  LAYOUT_IDS,
  LAYOUT_SPECS,
  parseDesignDocument,
  type DesignDocument,
  type LayoutId,
} from "../../dist/index.js";
import {
  DesignPiece,
  isLayoutMigrated,
  layoutComponentFor,
  TEXT_BUDGET,
  type LayoutContext,
} from "../../dist/react.js";

/**
 * Los layouts se comprueban por lo que componen: dimensiones del formato, zona
 * segura respetada, contenido presente y ausencia de texto horneado en
 * imágenes. La comparación pixel a pixel llega con el exportador de `P1-T05`.
 */

const context: LayoutContext = {
  assetBaseUrl: "https://panel.example/media",
  brand: {
    branch: "Rivadavia 673",
    central: "República de Siria 365",
    city: "Frías, Santiago del Estero",
    name: "Ferretería y Lubricentro Aramayo",
    phone: "3854 403534",
    shortName: "Aramayo",
  },
};

const photo = {
  alt: "Herramientas sobre un banco de trabajo",
  reference: {
    assetId: "stock-herramientas-electricas",
    source: "brand-library" as const,
  },
};

function documentFor(
  layout: LayoutId,
  overrides: Record<string, unknown> = {},
): DesignDocument {
  const spec = LAYOUT_SPECS[layout];
  const [format] = spec.formats;
  assert.ok(format);

  const content: Record<string, unknown> = { title: "Piso de taller" };
  if (spec.requiredFields.includes("price")) {
    content["price"] = "$ 24.500";
  }
  if (spec.requiredFields.includes("items")) {
    content["items"] = ["Primer punto", "Segundo punto"];
  }
  if (spec.requiredFields.includes("icon")) {
    content["icon"] = "productos";
  }
  if (spec.requiredFields.includes("subtitle")) {
    content["subtitle"] = "Con el producto adecuado se resuelve en el día.";
  }

  const result = parseDesignDocument({
    content,
    format,
    layout,
    media: spec.media.maximum > 0 ? [photo] : [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: `fixture-${layout}`,
    theme: "taller",
    ...overrides,
  });

  assert.equal(result.ok, true, `El documento de ${layout} debe ser válido.`);

  return result.document;
}

function markupFor(layout: LayoutId): string {
  return renderToStaticMarkup(
    createElement(DesignPiece, { context, document: documentFor(layout) }),
  );
}

const migratedLayouts = LAYOUT_IDS.filter((layout: LayoutId) =>
  isLayoutMigrated(layout),
);

test("cada identificador declara su estado en el catálogo curado", () => {
  assert.equal(Object.keys(CATALOG_STATUS).length, LAYOUT_IDS.length);

  for (const layout of LAYOUT_IDS) {
    assert.ok(
      ["current", "redesign", "retired"].includes(catalogStatusFor(layout)),
      `${layout} no declara un estado de catálogo válido.`,
    );
  }
});

test("una pieza retirada no tiene componente y falla al componerse", () => {
  for (const layout of LAYOUT_IDS) {
    if (catalogStatusFor(layout) !== "retired") {
      continue;
    }

    assert.ok(
      !isLayoutMigrated(layout),
      `${layout} está retirada pero tiene componente.`,
    );
    assert.throws(
      () => layoutComponentFor(layout),
      (error: unknown) =>
        error instanceof DesignEngineError && error.failure.stage === "layout",
    );
  }
});

test("toda pieza migrada está vigente en el catálogo", () => {
  assert.ok(migratedLayouts.length > 0);

  for (const layout of migratedLayouts) {
    assert.equal(
      catalogStatusFor(layout),
      "current",
      `${layout} tiene componente pero no está vigente en el catálogo.`,
    );
  }
});

test("cada layout migrado compone dentro de las dimensiones de su formato", () => {
  for (const layout of migratedLayouts) {
    const html = markupFor(layout);
    const [formatId] = LAYOUT_SPECS[layout].formats;
    assert.ok(formatId);
    const format = FORMATS[formatId];

    assert.match(
      html,
      /data-card=""/u,
      `${layout} no expone el nodo exportable.`,
    );
    assert.ok(
      html.includes(`width:${String(format.width)}px`),
      `${layout} no usa el ancho de su formato.`,
    );
    assert.ok(
      html.includes(`height:${String(format.height)}px`),
      `${layout} no usa el alto de su formato.`,
    );
    assert.ok(
      html.includes("Piso de taller"),
      `${layout} no compone el título recibido.`,
    );
  }
});

test("ningún layout hornea texto dentro de una imagen ni carga rutas arbitrarias", () => {
  for (const layout of migratedLayouts) {
    const html = markupFor(layout);

    for (const source of html.matchAll(/src="([^"]+)"/gu)) {
      const url = source[1] ?? "";
      assert.ok(
        url.startsWith("https://panel.example/media/"),
        `${layout} carga una imagen fuera de la biblioteca aprobada: ${url}.`,
      );
    }

    assert.ok(
      !html.includes("background-image"),
      `${layout} usa una imagen de fondo en lugar de componer con primitivas.`,
    );
  }
});

test("las piezas de feed respetan la zona segura del formato", () => {
  const html = markupFor("producto-destacado");
  const { safeArea } = FORMATS.feed;

  assert.ok(html.includes(`padding-top:${String(safeArea.top)}px`));
  assert.ok(html.includes(`padding-bottom:${String(safeArea.bottom)}px`));
  assert.ok(html.includes(`padding-left:${String(safeArea.left)}px`));
});

test("la portada destacada centra su símbolo dentro del círculo seguro", () => {
  const html = markupFor("destacada-cover");
  const { safeArea } = FORMATS.destacada;
  const circleDiameter =
    "circleDiameter" in safeArea ? safeArea.circleDiameter : 0;
  const ring = Math.round(circleDiameter * 0.72);

  assert.ok(circleDiameter > 0);
  assert.ok(html.includes(`width:${String(ring)}px`));
  assert.ok(html.includes("translate(-50%, -50%)"));
  assert.ok(html.includes("left:50%"));
});

test("un layout todavía sin componente falla como no registrado", () => {
  const pending = LAYOUT_IDS.find(
    (layout: LayoutId) => !isLayoutMigrated(layout),
  );

  if (pending === undefined) {
    return;
  }

  assert.throws(
    () => layoutComponentFor(pending),
    (error: unknown) =>
      error instanceof DesignEngineError && error.failure.stage === "layout",
  );
});

test("un título que excede el presupuesto se rechaza con su ruta", () => {
  const document = documentFor("producto-destacado", {
    content: { title: "a".repeat(TEXT_BUDGET.title + 1) },
  });

  assert.throws(
    () =>
      renderToStaticMarkup(createElement(DesignPiece, { context, document })),
    (error: unknown) => {
      assert.ok(error instanceof DesignEngineError);
      assert.equal(error.failure.stage, "content");
      assert.deepEqual(
        error.failure.issues.map((issue) => issue.path),
        ["content.title"],
      );
      return true;
    },
  );
});

test("el pie usa el perfil comercial recibido y no valores incrustados", () => {
  const html = markupFor("producto-destacado");

  assert.ok(html.includes(context.brand.phone));
  assert.ok(html.includes(context.brand.branch));
});
