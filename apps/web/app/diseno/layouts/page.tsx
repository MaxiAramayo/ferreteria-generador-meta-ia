import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  DESIGN_SCHEMA_VERSION,
  FORMATS,
  LAYOUT_IDS,
  LAYOUT_SPECS,
  parseDesignDocument,
  type DesignDocument,
  type LayoutId,
} from "@aramayo/design-engine";
import { DesignPiece, isLayoutMigrated } from "@aramayo/design-engine/react";
import type { Metadata } from "next";

/**
 * Harness de layouts.
 *
 * Compone cada layout migrado con contenido de ejemplo, a medidas reales y
 * reducido para revisarlos juntos contra las referencias congeladas.
 */

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Layouts del motor de diseño",
};

const context = {
  assetBaseUrl: "/media",
  brand: ARAMAYO_BRAND_PROFILE,
};

const samplePhoto = {
  alt: "Herramientas eléctricas sobre un banco de trabajo",
  reference: {
    assetId: "stock-herramientas-electricas",
    source: "brand-library" as const,
  },
};

const sampleContent: Record<string, unknown> = {
  badge: "Producto destacado",
  branch: "Sucursal · Rivadavia 673",
  callToAction: "Consultá stock",
  category: "Herramientas",
  icon: "herramienta",
  items: [
    "Stock para resolver en el día",
    "Atención cercana",
    "Todos los medios de pago",
  ],
  phone: "3854 403534",
  previousPrice: "$ 32.000",
  price: "$ 24.500",
  subtitle:
    "Consultá modelos disponibles, accesorios y mechas para cada trabajo.",
  title: "Taladros y herramientas para resolver en el día",
  validity: "Válido hasta el sábado",
};

function documentFor(layout: LayoutId): DesignDocument | undefined {
  const spec = LAYOUT_SPECS[layout];
  const [format] = spec.formats;

  if (format === undefined) {
    return undefined;
  }

  const allowed: ReadonlySet<string> = new Set([
    ...spec.requiredFields,
    ...spec.optionalFields,
  ]);
  const content = Object.fromEntries(
    Object.entries(sampleContent).filter(([field]) => allowed.has(field)),
  );

  const result = parseDesignDocument({
    content: { ...content, title: sampleContent["title"] },
    format,
    layout,
    media: spec.media.maximum > 0 ? [samplePhoto] : [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: `harness-${layout}`,
    theme: spec.family === "historia" ? "promo" : "taller",
  });

  return result.ok ? result.document : undefined;
}

function LayoutPreview({ layout }: { readonly layout: LayoutId }) {
  const document = documentFor(layout);
  const spec = LAYOUT_SPECS[layout];
  const [formatId] = spec.formats;
  const format = formatId === undefined ? FORMATS.feed : FORMATS[formatId];
  const scale = format.height > 1400 ? 0.16 : 0.22;

  return (
    <figure className="preview">
      <figcaption>
        <strong>{layout}</strong> · {format.id} · {format.width}×{format.height}
      </figcaption>
      <div
        className="preview-frame"
        style={{ height: format.height * scale, width: format.width * scale }}
      >
        <div
          style={{
            transform: `scale(${String(scale)})`,
            transformOrigin: "top left",
          }}
        >
          {document === undefined ? null : (
            <DesignPiece context={context} document={document} />
          )}
        </div>
      </div>
    </figure>
  );
}

export default function LayoutsHarnessPage() {
  const migrated = LAYOUT_IDS.filter((layout) => isLayoutMigrated(layout));
  const pending = LAYOUT_IDS.filter((layout) => !isLayoutMigrated(layout));

  return (
    <main>
      <h1>Layouts del motor de diseño</h1>
      <p className="lead">
        {migrated.length} de {LAYOUT_IDS.length} layouts migrados, compuestos
        con las primitivas y las medidas reales de cada formato.
      </p>

      <section aria-labelledby="migrados" className="panel">
        <h2 id="migrados">Migrados</h2>
        <div className="previews">
          {migrated.map((layout) => (
            <LayoutPreview key={layout} layout={layout} />
          ))}
        </div>
      </section>

      <section aria-labelledby="pendientes" className="panel">
        <h2 id="pendientes">Pendientes</h2>
        <p>
          Estos layouts están registrados y validados, pero todavía no tienen
          componente: componerlos falla con <code>layout: not-registered</code>.
        </p>
        <ul className="icons">
          {pending.map((layout) => (
            <li key={layout}>
              <code>{layout}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
