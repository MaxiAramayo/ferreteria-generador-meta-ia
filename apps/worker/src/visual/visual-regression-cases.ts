/**
 * Recorrido de la regresión visual (`P7-T02`).
 *
 * El criterio es cubrir los formatos y los perfiles aprobados, y el recorrido
 * se arma para que eso se pueda comprobar y no sea una promesa:
 *
 * - **catálogo**: cada pieza vigente en cada formato que declara, con un
 *   contenido fijo que ejerce precio, lista, icono y foto;
 * - **perfil**: los seis perfiles visuales en los tres formatos que componen,
 *   con los briefs y los fondos sintéticos de la evaluación de `P4-T08`;
 * - **determinista**: cada pieza de composición sin imagen generada, el camino
 *   que sale cuando la generación está apagada o no hay foto aprobada;
 * - **tema**: los cuatro temas sobre una pieza de feed y una de historia, para
 *   que ningún tema quede sin una pieza que lo pinte.
 *
 * Las piezas de composición no entran por el catálogo: su documento lo arma el
 * compositor y no una persona, así que se prueban por el camino que las
 * produce.
 *
 * El contenido de muestra es propio de esta suite a propósito: la línea base
 * depende de él, y la muestra de `pnpm design:review` tiene que poder cambiar
 * sin reescribirla.
 */

import {
  catalogStatusFor,
  DESIGN_SCHEMA_VERSION,
  LAYOUT_IDS,
  layoutSpecFor,
  parseDesignDocument,
  THEME_IDS,
  type DesignDocument,
  type FormatId,
  type LayoutId,
  type ThemeId,
} from "@aramayo/design-engine";
import { isLayoutMigrated } from "@aramayo/design-engine/react";
import { composedLayoutFor } from "@aramayo/domain";

import {
  imageQualityDataset,
  type ImageQualityDatasetEntry,
} from "../evaluation/image-quality-evaluation-dataset.ts";
import { composeImageQualityCase } from "../evaluation/image-quality-evaluation.service.ts";
import {
  compositionBrief,
  compositionCases,
  type CompositionCase,
} from "./composition-snapshot-cases.ts";
import { composePiece } from "./piece-composer.ts";
import { visualProfileFor } from "./visual-profiles.ts";

export type VisualRegressionSource =
  | { readonly kind: "catalogo"; readonly theme: ThemeId }
  | { readonly kind: "tema"; readonly theme: ThemeId }
  | { readonly entry: ImageQualityDatasetEntry; readonly kind: "perfil" }
  | { readonly composition: CompositionCase; readonly kind: "determinista" };

export interface VisualRegressionCase {
  readonly format: FormatId;
  /** Nombre del archivo de su línea base. */
  readonly id: string;
  readonly layout: LayoutId;
  readonly source: VisualRegressionSource;
}

const sampleContent = Object.freeze({
  badge: "Producto destacado",
  branch: "Sucursal · Rivadavia 673",
  callToAction: "Consultá stock",
  category: "Herramientas",
  icon: "herramienta",
  items: Object.freeze([
    "Taladro percutor",
    "Juego de mechas",
    "Maletín de transporte",
  ]),
  phone: "3854 403534",
  previousPrice: "$ 32.000",
  price: "$ 24.500",
  subtitle:
    "Consultá modelos disponibles, accesorios y mechas para cada trabajo.",
  title: "Taladro percutor 650 W",
  validity: "Válido hasta el sábado",
});

const samplePhoto = Object.freeze({
  alt: "Herramientas eléctricas sobre un banco de trabajo",
  reference: Object.freeze({
    assetId: "stock-herramientas-electricas",
    source: "brand-library",
  }),
});

/** Las piezas sobre las que se prueban los cuatro temas. */
const themeProbes: readonly (readonly [layout: LayoutId, format: FormatId])[] =
  [
    ["producto-precio", "feed"],
    ["historia-precio-dia", "historia"],
  ];

/** El tema con que se publica cada familia del catálogo por defecto. */
function catalogThemeFor(layout: LayoutId): ThemeId {
  return layoutSpecFor(layout).family === "historia" ? "promo" : "taller";
}

export function visualRegressionCases(): readonly VisualRegressionCase[] {
  const cases: VisualRegressionCase[] = [];

  for (const layout of LAYOUT_IDS) {
    const spec = layoutSpecFor(layout);

    if (
      catalogStatusFor(layout) !== "current" ||
      !isLayoutMigrated(layout) ||
      spec.family === "composicion"
    ) {
      continue;
    }

    for (const format of spec.formats) {
      cases.push({
        format,
        id: `catalogo-${layout}-${format}`,
        layout,
        source: { kind: "catalogo", theme: catalogThemeFor(layout) },
      });
    }
  }

  for (const entry of imageQualityDataset()) {
    const layout = composedLayoutFor(
      visualProfileFor(entry.profileId).reservedSpace,
    );

    if (layout === null) {
      throw new Error(
        `El perfil ${entry.profileId} reserva una región que ninguna pieza compone.`,
      );
    }

    cases.push({
      format: entry.format,
      id: `perfil-${entry.caseId}`,
      layout,
      source: { entry, kind: "perfil" },
    });
  }

  for (const composition of compositionCases()) {
    if (composition.background !== null) {
      continue;
    }

    cases.push({
      format: composition.format,
      id: `determinista-${composition.layout}-${composition.format}`,
      layout: composition.layout,
      source: { composition, kind: "determinista" },
    });
  }

  for (const theme of THEME_IDS) {
    for (const [layout, format] of themeProbes) {
      // El catálogo ya pinta esa pieza con su tema por defecto.
      if (theme === catalogThemeFor(layout)) {
        continue;
      }

      cases.push({
        format,
        id: `tema-${theme}-${layout}-${format}`,
        layout,
        source: { kind: "tema", theme },
      });
    }
  }

  return Object.freeze(cases);
}

function sampleDocument(
  entry: VisualRegressionCase,
  theme: ThemeId,
): DesignDocument {
  const spec = layoutSpecFor(entry.layout);
  const admitted: ReadonlySet<string> = new Set([
    ...spec.requiredFields,
    ...spec.optionalFields,
  ]);
  const content = Object.fromEntries(
    Object.entries(sampleContent).filter(([field]) => admitted.has(field)),
  );
  const result = parseDesignDocument({
    content: { ...content, title: sampleContent.title },
    format: entry.format,
    layout: entry.layout,
    media: Array.from({ length: Math.min(spec.media.maximum, 3) }, () => ({
      ...samplePhoto,
    })),
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: `regresion-${entry.id}`.slice(0, 64),
    theme,
  });

  if (!result.ok) {
    throw new Error(
      `${entry.id}: el documento de muestra no es válido (${result.issues.map((issue) => issue.path).join(", ")}).`,
    );
  }

  return result.document;
}

/** Arma el documento que se renderiza, por el mismo camino que en producción. */
export async function visualRegressionDocument(
  entry: VisualRegressionCase,
): Promise<DesignDocument> {
  const { source } = entry;

  switch (source.kind) {
    case "catalogo":
    case "tema":
      return sampleDocument(entry, source.theme);
    case "perfil":
      return (await composeImageQualityCase(source.entry)).document;
    case "determinista":
      return composePiece({
        base: null,
        brief: compositionBrief,
        format: source.composition.format,
        region: source.composition.region,
        slug: `regresion-${entry.id}`.slice(0, 64),
      }).document;
  }
}
