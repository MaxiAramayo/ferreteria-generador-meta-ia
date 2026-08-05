import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COMPOSED_TITLE_BUDGET,
  composedPanelRect,
  composedTitleToken,
  DESIGN_SCHEMA_VERSION,
  FORMATS,
  LAYOUT_SPECS,
  layoutSpecFor,
  parseDesignDocument,
  supportsFormat,
  type ComposedLayoutId,
  type ComposedRegion,
  type DesignDocument,
  type FormatId,
} from "../../dist/index.js";
import { DesignPiece, type LayoutContext } from "../../dist/react.js";

/**
 * Las piezas de composición se comprueban por lo que sostienen: el panel cae
 * exactamente en el rectángulo reservado, entra en la zona segura y lleva el
 * texto comercial y el logo. La comprobación sobre píxeles renderizados —el
 * contraste real y el desborde del panel— la hace la suite del worker con un
 * navegador; acá se fija el contrato.
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

const regionByLayout: Readonly<Record<ComposedLayoutId, ComposedRegion>> = {
  "composicion-banda-superior": "upper_band",
  "composicion-circulo-central": "center_circle",
  "composicion-tercio-inferior": "lower_third",
};

const composedLayouts = Object.keys(regionByLayout) as ComposedLayoutId[];

/** Una base embebida mínima: un PNG de un píxel en base64. */
const inlineBase =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function documentFor(
  layout: ComposedLayoutId,
  format: FormatId,
): DesignDocument {
  const spec = layoutSpecFor(layout);
  const content: Record<string, unknown> = {
    badge: "Oferta",
    callToAction: "Reservalo por WhatsApp",
    title: "Taladro percutor 650 W",
  };

  // Una banda superior no admite precio: el documento se arma con lo que la
  // pieza declara saber ubicar, igual que hace el compositor.
  if (spec.optionalFields.includes("price")) {
    content["price"] = "$ 24.500";
  }

  const result = parseDesignDocument({
    content,
    format,
    layout,
    media: [
      {
        alt: "Base generada para la pieza",
        reference: { dataUrl: inlineBase, source: "inline" },
      },
    ],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: `composicion-${layout}-${format}`,
    theme: "taller",
  });

  assert.equal(
    result.ok,
    true,
    `El documento de ${layout} en ${format} debe ser válido.`,
  );

  return result.document;
}

test("cada pieza de composición declara la familia y formatos aprobados", () => {
  for (const layout of composedLayouts) {
    const spec = layoutSpecFor(layout);

    assert.equal(spec.family, "composicion");
    assert.deepEqual([...spec.formats], ["feed", "cuadrado", "historia"]);
    // Una pieza de composición siempre lleva la base generada.
    assert.equal(spec.media.maximum, 1);
    assert.deepEqual([...spec.requiredFields], ["title"]);
  }
});

test("sólo el tercio inferior admite bajada, y la banda superior no admite precio", () => {
  const band = layoutSpecFor("composicion-banda-superior");
  const third = layoutSpecFor("composicion-tercio-inferior");

  assert.ok(!band.optionalFields.includes("price"));
  assert.ok(!band.optionalFields.includes("subtitle"));
  assert.ok(third.optionalFields.includes("price"));
  assert.ok(third.optionalFields.includes("subtitle"));
});

test("el rectángulo del panel queda dentro de la zona segura del formato", () => {
  for (const layout of composedLayouts) {
    const region = regionByLayout[layout];

    for (const formatId of layoutSpecFor(layout).formats) {
      const format = FORMATS[formatId];
      const rect = composedPanelRect(region, format);

      assert.ok(
        rect.x >= format.safeArea.left,
        `${layout} en ${formatId} empieza antes del margen seguro izquierdo.`,
      );
      assert.ok(
        rect.y >= format.safeArea.top,
        `${layout} en ${formatId} empieza por encima del margen seguro superior.`,
      );
      assert.ok(
        rect.x + rect.width <= format.width - format.safeArea.right,
        `${layout} en ${formatId} pasa el margen seguro derecho.`,
      );
      assert.ok(
        rect.y + rect.height <= format.height - format.safeArea.bottom,
        `${layout} en ${formatId} pasa el margen seguro inferior.`,
      );
      assert.ok(rect.width > 0 && rect.height > 0);
    }
  }
});

test("el escalón del titular nunca crece cuando el texto se alarga", () => {
  const order = { h1: 3, h2: 2, sub: 1 } as const;

  for (const layout of composedLayouts) {
    const region = regionByLayout[layout];

    for (const formatId of layoutSpecFor(layout).formats) {
      const rect = composedPanelRect(region, FORMATS[formatId]);
      let previous = order[composedTitleToken(1, region, rect)];

      for (
        let length = 2;
        length <= COMPOSED_TITLE_BUDGET[region];
        length += 1
      ) {
        const current = order[composedTitleToken(length, region, rect)];

        assert.ok(
          current <= previous,
          `El titular de ${region} en ${formatId} sube de escalón al llegar a ${String(length)} caracteres.`,
        );
        previous = current;
      }
    }
  }
});

test("un panel más bajo nunca usa un titular más grande", () => {
  // Es la regla que faltaba: el mismo titular entra en un renglón de un tercio
  // inferior de feed y ocupa dos en uno de cuadrado, donde ya no queda lugar
  // para el precio.
  const order = { h1: 3, h2: 2, sub: 1 } as const;
  const feed = composedPanelRect("lower_third", FORMATS.feed);
  const square = composedPanelRect("lower_third", FORMATS.cuadrado);

  assert.ok(square.height < feed.height);
  assert.ok(
    order[composedTitleToken(17, "lower_third", square)] <
      order[composedTitleToken(17, "lower_third", feed)],
  );
});

test("la pieza compuesta lleva la base embebida, el logo y el texto comercial", () => {
  const markup = renderToStaticMarkup(
    createElement(DesignPiece, {
      context,
      document: documentFor("composicion-tercio-inferior", "feed"),
    }),
  );

  assert.ok(markup.includes("data-panel"), "La pieza no dibuja el panel.");
  assert.ok(markup.includes("data-logo"), "La pieza no lleva el logo.");
  assert.ok(markup.includes("data-price"), "La pieza no lleva el precio.");
  assert.ok(markup.includes("data-cta"), "La pieza no lleva el CTA.");
  assert.ok(markup.includes("Taladro percutor 650 W"));
  assert.ok(markup.includes("$ 24.500"));
  assert.ok(
    markup.includes(`src="${inlineBase}"`),
    "La base embebida no llegó a la etiqueta de imagen.",
  );
});

test("las tres piezas componen en los tres formatos aprobados", () => {
  for (const layout of composedLayouts) {
    for (const formatId of LAYOUT_SPECS[layout].formats) {
      assert.ok(supportsFormat(layoutSpecFor(layout), formatId));

      const markup = renderToStaticMarkup(
        createElement(DesignPiece, {
          context,
          document: documentFor(layout, formatId),
        }),
      );

      assert.ok(
        markup.includes("data-panel"),
        `${layout} en ${formatId} no dibuja el panel.`,
      );
    }
  }
});

test("un formato fuera de los aprobados no produce documento", () => {
  const result = parseDesignDocument({
    content: { title: "Taladro percutor 650 W" },
    format: "banner-fb",
    layout: "composicion-tercio-inferior",
    media: [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "composicion-banner",
    theme: "taller",
  });

  assert.equal(result.ok, false);
});
