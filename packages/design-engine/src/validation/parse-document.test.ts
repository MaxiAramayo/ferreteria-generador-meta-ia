import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DESIGN_SCHEMA_VERSION,
  inlineAssetLimits,
} from "../contracts/document.ts";
import type { DesignIssue, DesignIssueCode } from "./issues.ts";
import { parseDesignDocument } from "./parse-document.ts";

function validDocument(): Record<string, unknown> {
  return {
    content: {
      badge: "Producto destacado",
      callToAction: "Consultá stock",
      category: "Herramientas",
      subtitle: "Consultá modelos disponibles y accesorios.",
      title: "Taladros para resolver en el día",
    },
    format: "feed",
    layout: "producto-destacado",
    media: [
      {
        alt: "Taladro y herramientas eléctricas sobre un banco de trabajo",
        reference: {
          assetId: "stock-herramientas-electricas",
          source: "brand-library",
        },
      },
    ],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "producto-destacado-taladros",
    theme: "taller",
  };
}

function issueCodes(issues: readonly DesignIssue[]): readonly string[] {
  return issues.map(({ code, path }) => `${path}:${code}`);
}

function parseInvalid(document: unknown): readonly DesignIssue[] {
  const result = parseDesignDocument(document);

  assert.equal(result.ok, false, "Se esperaba un documento inválido.");
  return result.issues;
}

function assertIssue(
  issues: readonly DesignIssue[],
  path: string,
  code: DesignIssueCode,
): void {
  assert.ok(
    issues.some((entry) => entry.path === path && entry.code === code),
    `Se esperaba ${path}:${code} en ${issueCodes(issues).join(", ")}.`,
  );
}

test("un documento completo se acepta y queda normalizado", () => {
  const result = parseDesignDocument(validDocument());

  assert.equal(result.ok, true);

  const [asset] = result.document.media;

  assert.equal(result.document.layout, "producto-destacado");
  assert.equal(result.document.schemaVersion, DESIGN_SCHEMA_VERSION);
  assert.ok(asset);
  assert.equal(asset.fit, "cover");
  assert.deepEqual({ ...asset.focus }, { x: 50, y: 50 });
  assert.equal(asset.zoom, 1);
});

test("el tema ausente toma el valor por defecto y uno desconocido falla", () => {
  const withoutTheme = Object.fromEntries(
    Object.entries(validDocument()).filter(([key]) => key !== "theme"),
  );
  const accepted = parseDesignDocument(withoutTheme);

  assert.equal(accepted.ok, true);
  assert.equal(accepted.document.theme, "taller");

  assertIssue(
    parseInvalid({ ...validDocument(), theme: "neon" }),
    "theme",
    "unknown-theme",
  );
});

test("una entrada que no es un objeto se rechaza sin recorrerla", () => {
  for (const value of [null, undefined, "documento", 7, []]) {
    assertIssue(parseInvalid(value), "document", "invalid-type");
  }
});

test("una versión de esquema distinta detiene la validación del documento", () => {
  assertIssue(
    parseInvalid({ ...validDocument(), schemaVersion: 2 }),
    "schemaVersion",
    "schema-version-unsupported",
  );
});

test("un layout desconocido no llega al render", () => {
  assertIssue(
    parseInvalid({ ...validDocument(), layout: "producto-inventado" }),
    "layout",
    "unknown-layout",
  );
});

test("un formato no aprobado para el layout se rechaza", () => {
  assertIssue(
    parseInvalid({ ...validDocument(), format: "historia" }),
    "format",
    "layout-format-mismatch",
  );
});

test("un campo obligatorio ausente se informa por su ruta", () => {
  const document = validDocument();
  document["content"] = { badge: "Promo" };

  const issues = parseInvalid({
    ...document,
    layout: "promo-producto",
    slug: "promo-producto-pintura",
  });

  assertIssue(issues, "content.title", "missing");
  assertIssue(issues, "content.price", "missing");
});

test("un campo que el layout no admite se rechaza como no soportado", () => {
  const document = validDocument();
  document["content"] = {
    price: "$ 1.000",
    title: "Banner institucional",
  };

  assertIssue(
    parseInvalid({
      ...document,
      format: "banner-fb",
      layout: "banner-marca",
      media: [],
      slug: "banner-marca-institucional",
    }),
    "content.price",
    "field-not-supported",
  );
});

test("un campo inexistente en el contrato se informa como desconocido", () => {
  const document = validDocument();
  document["content"] = {
    descuento: "30%",
    title: "Taladros",
  };

  assertIssue(parseInvalid(document), "content.descuento", "unknown-field");
});

test("el texto vacío o excesivo no se acepta", () => {
  const emptyTitle = validDocument();
  emptyTitle["content"] = { title: "   " };
  assertIssue(parseInvalid(emptyTitle), "content.title", "missing");

  const longTitle = validDocument();
  longTitle["content"] = { title: "a".repeat(241) };
  assertIssue(parseInvalid(longTitle), "content.title", "too-long");
});

test("los ítems se validan en cantidad y contenido", () => {
  const tooMany = {
    content: {
      items: Array.from({ length: 9 }, (_, index) => `Punto ${String(index)}`),
      title: "Consejos de plomería",
    },
    format: "cuadrado",
    layout: "tip-oficio",
    media: [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "tip-oficio-plomeria",
    theme: "claro",
  };

  assertIssue(parseInvalid(tooMany), "content.items", "too-many");

  assertIssue(
    parseInvalid({
      ...tooMany,
      content: { items: [""], title: "Consejos de plomería" },
    }),
    "content.items[0]",
    "missing",
  );
});

test("un icono fuera del registro semántico se rechaza", () => {
  assertIssue(
    parseInvalid({
      content: { icon: "martillo-dorado", title: "Productos" },
      format: "destacada",
      layout: "destacada-cover",
      media: [],
      schemaVersion: DESIGN_SCHEMA_VERSION,
      slug: "destacada-productos",
      theme: "taller",
    }),
    "content.icon",
    "invalid-value",
  );
});

test("un layout sin ranuras de imagen rechaza los medios declarados", () => {
  const document = validDocument();

  assertIssue(
    parseInvalid({
      ...document,
      content: { icon: "productos", title: "Productos" },
      format: "destacada",
      layout: "destacada-cover",
      slug: "destacada-productos",
    }),
    "media",
    "media-not-supported",
  );
});

test("más imágenes que ranuras disponibles se rechazan", () => {
  const document = validDocument();
  const asset = {
    alt: "Producto en góndola",
    reference: { assetId: "stock-producto", source: "brand-library" },
  };

  assertIssue(
    parseInvalid({ ...document, media: [asset, asset] }),
    "media",
    "too-many",
  );
});

test("una referencia de activo con ruta local o sin HTTPS se rechaza", () => {
  const document = validDocument();

  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          alt: "Foto de producto",
          reference: { assetId: "../../etc/passwd", source: "brand-library" },
        },
      ],
    }),
    "media[0].reference.assetId",
    "invalid-format",
  );

  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          alt: "Foto de producto",
          reference: { source: "remote", url: "http://cdn.example/foto.jpg" },
        },
      ],
    }),
    "media[0].reference.url",
    "invalid-value",
  );

  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          alt: "Foto de producto",
          reference: { source: "disco", path: "/tmp/foto.jpg" },
        },
      ],
    }),
    "media[0].reference.source",
    "invalid-value",
  );
});

test("un activo embebido se acepta sólo como mapa de bits en base64", () => {
  const document = validDocument();
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const accepted = parseDesignDocument({
    ...document,
    media: [
      {
        alt: "Base generada",
        reference: { dataUrl: png, source: "inline" },
      },
    ],
  });

  assert.ok(accepted.ok);
  assert.deepEqual(accepted.document.media[0]?.reference, {
    dataUrl: png,
    source: "inline",
  });

  // Un SVG embebido ejecuta script dentro del render: no entra aunque sea una
  // imagen y aunque venga en base64.
  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          alt: "Base generada",
          reference: {
            dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
            source: "inline",
          },
        },
      ],
    }),
    "media[0].reference.dataUrl",
    "invalid-format",
  );

  // Tampoco entra una URL de datos sin codificar.
  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          alt: "Base generada",
          reference: {
            dataUrl: "data:image/png,%89PNG",
            source: "inline",
          },
        },
      ],
    }),
    "media[0].reference.dataUrl",
    "invalid-format",
  );

  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          alt: "Base generada",
          reference: {
            dataUrl: `data:image/png;base64,${"A".repeat(inlineAssetLimits.dataUrlMaximum)}`,
            source: "inline",
          },
        },
      ],
    }),
    "media[0].reference.dataUrl",
    "too-long",
  );
});

test("un activo sin texto alternativo no se acepta", () => {
  const document = validDocument();

  assertIssue(
    parseInvalid({
      ...document,
      media: [
        {
          reference: { assetId: "stock-producto", source: "brand-library" },
        },
      ],
    }),
    "media[0].alt",
    "invalid-type",
  );
});

test("el encuadre y el zoom se validan dentro de sus límites", () => {
  const document = validDocument();
  const withFraming = (framing: Record<string, unknown>): unknown => ({
    ...document,
    media: [
      {
        alt: "Foto de producto",
        reference: { assetId: "stock-producto", source: "brand-library" },
        ...framing,
      },
    ],
  });

  assertIssue(
    parseInvalid(withFraming({ focus: { x: 140, y: 50 } })),
    "media[0].focus.x",
    "invalid-value",
  );
  assertIssue(
    parseInvalid(withFraming({ zoom: 9 })),
    "media[0].zoom",
    "invalid-value",
  );
  assertIssue(
    parseInvalid(withFraming({ fit: "estirar" })),
    "media[0].fit",
    "invalid-value",
  );
});

test("una clave desconocida en el documento se informa y no se ignora", () => {
  assertIssue(
    parseInvalid({ ...validDocument(), caption: "Texto de Instagram" }),
    "caption",
    "unknown-field",
  );
});

test("un slug inválido se rechaza antes de persistir la pieza", () => {
  assertIssue(
    parseInvalid({ ...validDocument(), slug: "Producto Destacado" }),
    "slug",
    "invalid-format",
  );
});
