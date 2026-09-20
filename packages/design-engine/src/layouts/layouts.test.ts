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
  if (spec.requiredFields.includes("category")) {
    content["category"] = "Equipos de taller";
  }
  if (spec.requiredFields.includes("subtitle")) {
    content["subtitle"] = "Con el producto adecuado se resuelve en el día.";
  }
  if (spec.requiredFields.includes("callToAction")) {
    content["callToAction"] = "Consultanos por WhatsApp";
  }

  const result = parseDesignDocument({
    content,
    format,
    layout,
    media:
      spec.media.maximum > 0
        ? Array.from({ length: Math.max(spec.media.minimum, 1) }, () => photo)
        : [],
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
    // La imagen propia se publica tal cual: no compone texto.
    if (
      layout === "historia-apertura-imagen" ||
      layout === "historia-lubricentro-imagen"
    ) {
      continue;
    }
    assert.ok(
      html.includes("Piso de taller"),
      `${layout} no compone el título recibido.`,
    );
  }
});

test("ningún layout hornea texto dentro de una imagen ni carga rutas arbitrarias", () => {
  const recurringLayouts = new Set<LayoutId>([
    "historia-apertura-cartel",
    "historia-apertura-esquina",
    "historia-apertura-horario",
    "historia-apertura-imagen",
    "historia-apertura-locales",
    "historia-apertura-placa",
    "historia-lubricentro-esquina",
    "historia-lubricentro-imagen",
    "historia-lubricentro-placa",
    "historia-lubricentro-ventana",
  ]);
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
      recurringLayouts.has(layout) || !html.includes("background-image"),
      `${layout} usa una imagen de fondo en lugar de componer con primitivas.`,
    );
    if (recurringLayouts.has(layout)) {
      assert.ok(
        !html.includes("url("),
        `${layout} no puede cargar un fondo externo: su trama debe ser determinista.`,
      );
    }
  }
});

function openingDocument(
  layout: LayoutId,
  overrides: Record<string, unknown> = {},
): DesignDocument {
  return documentFor(layout, {
    content: {
      callToAction: "¿Buscás algo? Escribinos",
      features: [
        { icon: "herramientas", label: "Herramientas" },
        { icon: "electricidad", label: "Electricidad" },
        { icon: "sanitarios", label: "Sanitarios" },
      ],
      greeting: "Buen día, Frías",
      highlights: ["Asesoramiento personalizado", "Variedad de marcas"],
      items: [
        "Casa Central · República de Siria 365",
        "Sucursal · Rivadavia 673",
      ],
      subtitle: "Te esperamos en nuestros dos locales",
      title: "¡Ya abrimos!",
      validity: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
    },
    theme: "promo",
    ...overrides,
  });
}

function openingMarkup(document: DesignDocument): string {
  return renderToStaticMarkup(
    createElement(DesignPiece, { context, document }),
  );
}

const openingCompositions: readonly LayoutId[] = [
  "historia-apertura-cartel",
  "historia-apertura-esquina",
  "historia-apertura-horario",
  "historia-apertura-locales",
  "historia-apertura-placa",
];

test("cada apertura compone marca, saludo, rubros, datos y contacto", () => {
  for (const layout of openingCompositions) {
    const html = openingMarkup(openingDocument(layout));

    assert.match(html, /data-logo=""/u, `${layout} no lleva la marca.`);
    assert.ok(html.includes("Buen día, Frías"), `${layout} sin saludo.`);
    assert.ok(html.includes("¡Ya abrimos!"), `${layout} sin titular.`);
    assert.ok(html.includes("Herramientas"), `${layout} sin rubros.`);
    assert.ok(
      html.includes("Asesoramiento personalizado"),
      `${layout} sin diferenciales.`,
    );
    assert.ok(
      html.includes("República de Siria 365") && html.includes("Rivadavia 673"),
      `${layout} no muestra las sucursales.`,
    );
    // La tarjeta angosta parte el horario en renglones; el dato es el mismo.
    assert.ok(
      html.includes("08:30 a 13:00") && html.includes("16:30 a 20:30"),
      `${layout} no muestra el horario.`,
    );
    assert.ok(
      html.includes("Escribinos") && html.includes(context.brand.phone),
      `${layout} no muestra el contacto.`,
    );
    // La foto viene del documento, nunca de una ruta propia del layout.
    assert.ok(
      html.includes(
        'src="https://panel.example/media/stock-herramientas-electricas.jpg"',
      ),
      `${layout} no compone la foto del documento.`,
    );
  }
});

const lubricentroFrames: readonly LayoutId[] = [
  "historia-lubricentro-esquina",
  "historia-lubricentro-placa",
  "historia-lubricentro-ventana",
];

test("cada marco del lubricentro lleva su cartel, sus servicios y su turno", () => {
  for (const layout of lubricentroFrames) {
    const html = openingMarkup(
      openingDocument(layout, {
        content: {
          callToAction: "Pedí tu turno",
          features: [
            { icon: "aceite", label: "Lubricantes" },
            { icon: "bateria", label: "Baterías" },
          ],
          highlights: ["Autos", "Motos"],
          subtitle: "Cambio de aceite con fosa en República de Siria 365",
          title: "¿Toca el service?",
          validity: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
        },
        theme: "lubricentro",
      }),
    );

    assert.match(html, /data-cartel=""/u, `${layout} no lleva el cartel.`);
    assert.ok(html.includes("¿Toca el service?"), `${layout} sin titular.`);
    assert.ok(
      html.includes("Cambio de aceite con fosa en República de Siria 365"),
      `${layout} no dice dónde se atiende.`,
    );
    assert.ok(html.includes("Lubricantes"), `${layout} sin servicios.`);
    assert.ok(html.includes("Motos"), `${layout} sin vehículos.`);
    assert.ok(
      html.includes("Pedí tu turno") && html.includes(context.brand.phone),
      `${layout} no muestra el contacto.`,
    );
    // La paleta del lubricentro es suya: amarillo de señal y grafito.
    assert.ok(html.includes("#ffb200"), `${layout} sin amarillo de señal.`);
  }
});

test("el marco de la esquina deja libre el pie de la foto", () => {
  const corner = openingMarkup(
    openingDocument("historia-apertura-esquina", {}),
  );
  const plate = openingMarkup(openingDocument("historia-apertura-placa", {}));

  // La tarjeta se apoya arriba a la derecha; la placa ocupa el ancho abajo.
  assert.match(corner, /data-frame-card=""/u);
  assert.ok(!corner.includes('data-opening-plate=""'));
  assert.match(plate, /data-opening-plate=""/u);
  assert.ok(!plate.includes('data-frame-card=""'));
});

test("una apertura sin saludo ancla la localidad del perfil", () => {
  const document = openingDocument("historia-apertura-cartel");
  const { greeting, ...withoutGreeting } = document.content;
  assert.equal(greeting, "Buen día, Frías");
  const html = openingMarkup({ ...document, content: withoutGreeting });

  assert.ok(html.includes("En Frías"));
});

test("una apertura sin foto muestra la marca en lugar de inventar una", () => {
  for (const layout of openingCompositions) {
    const html = openingMarkup(openingDocument(layout, { media: [] }));

    assert.match(html, /data-photo-fallback=""/u, layout);
    assert.ok(!html.includes("<img"), `${layout} dibujó una imagen.`);
  }
});

test("el acento verde pinta el botón, no el resto", () => {
  const brand = openingMarkup(openingDocument("historia-apertura-cartel"));
  const green = openingMarkup(
    openingDocument("historia-apertura-cartel", {
      content: {
        ...openingDocument("historia-apertura-cartel").content,
        accent: "verde",
      },
    }),
  );
  const verde = "background-color:#1e7d3f";

  assert.ok(!brand.includes(verde));
  // La etiqueta de estado ya no existe: el verde vive sólo en el botón.
  assert.equal(green.split(verde).length - 1, 1);
});

test("la imagen propia ocupa el lienzo y no le agrega texto", () => {
  const html = openingMarkup(
    openingDocument("historia-apertura-imagen", {
      content: { title: "¡Ya abrimos!" },
    }),
  );

  assert.match(html, /data-opening-own-image=""/u);
  assert.match(html, /<img/u);
  assert.ok(!html.includes("¡Ya abrimos!"));
  assert.ok(!html.includes("data-logo"));
  assert.ok(!html.includes("data-cta"));
});

test("un saludo o un horario que no entran se rechazan con su ruta", () => {
  const base = openingDocument("historia-apertura-cartel");

  for (const [field, budget] of [
    ["greeting", TEXT_BUDGET.greeting],
    ["validity", TEXT_BUDGET.validity],
  ] as const) {
    const document = {
      ...base,
      content: { ...base.content, [field]: "a".repeat(budget + 1) },
    };

    assert.throws(
      () => openingMarkup(document),
      (error: unknown) =>
        error instanceof DesignEngineError &&
        error.failure.stage === "content" &&
        error.failure.issues.some(({ path }) => path === `content.${field}`),
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

test("producto editorial conserva la foto completa dentro de un marco difuminado", () => {
  const html = markupFor("producto-editorial");

  assert.match(html, /data-product-editorial=""/u);
  assert.match(html, /data-editorial-blur-frame=""/u);
  assert.match(html, /filter:blur\(34px\)/u);
  assert.match(html, /data-editorial-photo=""/u);
  assert.match(html, /object-fit:contain/u);
  assert.match(html, /data-editorial-information=""/u);
  assert.match(html, /data-availability=""/u);
  assert.match(html, /data-price=""/u);
  assert.match(html, /data-logo=""/u);
});

test("producto editorial sin importe invita a consultar con texto de cuerpo", () => {
  const html = markupFor("producto-editorial");
  assert.doesNotMatch(html, /Precio minorista/u);
  assert.match(
    html,
    /data-price=""[^>]*><span[^>]*font-family:&quot;Archivo&quot;[^>]*text-transform:none[^>]*>Consultar precio<\/span>/u,
  );
  const priced = renderToStaticMarkup(
    createElement(DesignPiece, {
      context,
      document: documentFor("producto-editorial", {
        content: {
          title: "Equipo de taller",
          category: "Herramientas",
          price: "$ 1.000",
        },
      }),
    }),
  );
  assert.match(priced, /Precio minorista/u);
  assert.match(priced, /\$ 1\.000/u);
  assert.doesNotMatch(priced, /Consultar precio/u);
});

test("las fichas de variantes exigen una escena y exponen la guía de medidas", () => {
  const invalid = parseDesignDocument({
    content: { items: ["Medida A", "Medida B"], title: "Conectores" },
    format: "feed",
    layout: "ficha-variantes",
    media: [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "ficha-incompleta",
    theme: "taller",
  });

  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some(({ path }) => path === "media"));

  const markup = markupFor("ficha-variantes");
  assert.ok(markup.includes("data-variant-board"));
  assert.ok(markup.includes("data-measurement-rail"));
});

test("las piezas de uso exigen una escena y enumeran los pasos", () => {
  const invalid = parseDesignDocument({
    content: { items: ["Paso A", "Paso B"], title: "Uso del producto" },
    format: "feed",
    layout: "guia-aplicacion",
    media: [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "uso-sin-escena",
    theme: "taller",
  });

  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some(({ path }) => path === "media"));
  assert.ok(markupFor("guia-aplicacion").includes("data-application-steps"));
});

test("la localidad compone EN FRÍAS como una única unidad tipográfica", () => {
  const markup = markupFor("ficha-variantes");

  assert.ok(markup.includes('data-locality-label=""'));
  assert.ok(markup.includes("EN FRÍAS"));
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
});

test("una pieza sin sucursal declarada muestra la dirección, sin rótulo", () => {
  // Antes lo decidía el tema: esta misma pieza, con tema «taller», afirmaba la
  // sucursal de Rivadavia aunque nadie la hubiera elegido, y podía contradecir
  // al copy. Va la dirección sola: el negocio nombra sus puntos de atención por
  // su calle, y así los renombró en configuración.
  const html = markupFor("producto-destacado");

  assert.ok(html.includes(context.brand.central));
  assert.ok(!html.includes(`Sucursal · ${context.brand.branch}`));
  assert.ok(!html.includes("Casa Central ·"));
});
