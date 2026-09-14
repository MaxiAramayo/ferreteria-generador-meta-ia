import type { DesignFormat } from "../formats/formats.ts";
import type { FrameLayoutId } from "../registry/layout-id.ts";

/**
 * Medidas de la familia de marcos «Letrero de Chapa» (`ADR-029`).
 *
 * Los marcos no escriben dentro de un rectángulo que el modelo dejó libre: cada
 * uno ocupa su propia zona —cartel, rótulo, etiqueta, sello, velo, columna,
 * zócalo o vitrina— y quien revisa la variante elige el que no tapa el
 * producto. Lo que se decide acá, antes de que exista un render, es cuánto
 * texto entra en cada zona y con qué tamaño.
 */

export const FRAME_LAYOUT_IDS: readonly FrameLayoutId[] = Object.freeze([
  "marco-firma",
  "marco-etiqueta",
  "marco-sello",
  "marco-velo-superior",
  "marco-velo-inferior",
  "marco-columna-izquierda",
  "marco-columna-derecha",
  "marco-zocalo",
  "marco-vitrina",
]);

const frameLayoutIds: ReadonlySet<string> = new Set(FRAME_LAYOUT_IDS);

export function isFrameLayoutId(value: string): value is FrameLayoutId {
  return frameLayoutIds.has(value);
}

/** Alto del cartel: la placa con isotipo y nombre, y su remate con la ciudad. */
export const CARTEL_HEIGHT = 92;

/** Aire entre el cartel y el primer bloque de texto que cuelga debajo. */
export const CARTEL_GAP = 40;

/**
 * Tramo en que el velo se desvanece. Ningún texto se apoya en él: el texto vive
 * en el tramo denso, que empieza donde termina este.
 */
export const VEIL_FADE = 240;

/**
 * Opacidad de tinta del tramo denso del velo.
 *
 * El mínimo que hace falta es 0,64: con esa opacidad el papel de marca mide
 * 4,5:1 incluso sobre un píxel blanco puro, el peor fondo que puede devolver un
 * modelo. 0,86 deja margen para el suavizado de las letras y para la sombra del
 * texto, y la suite de composición lo mide sobre los fondos hostiles.
 */
export const VEIL_DENSE_OPACITY = 0.86;
export const VEIL_TEXT_MINIMUM_OPACITY = 0.64;

/** Ancho de las columnas macizas, el mismo en los tres formatos. */
export const COLUMN_WIDTH = 500;

/** Relleno de la columna del lado de la foto; del lado del borde manda la zona segura. */
export const COLUMN_INNER_GUTTER = 40;

/** Corte de la esquina de la etiqueta, en el ángulo del hexágono del isotipo. */
export const TAG_CORNER_CUT = 44;

/** Relleno de la etiqueta. */
export const TAG_PADDING = 32;

/** Relleno lateral del sello: aleja el texto del borde curvo. */
export const SEAL_PADDING = 70;

/** Cuánto se monta el botón del sello sobre el borde del círculo. */
export const SEAL_CTA_OVERLAP = 40;

/** Cuánto sobresale ese botón por debajo del círculo. */
export const SEAL_CTA_PROTRUSION = 30;

/** Ancho máximo del titular dentro del rótulo de la firma. */
export const FIRMA_TITLE_MAXIMUM_WIDTH = 560;

/** Alto mínimo del zócalo, como fracción del lienzo: por debajo deja de ser una base. */
export const PLINTH_MINIMUM_SHARE = 0.3;

/** Relleno superior del zócalo. */
export const PLINTH_PADDING_TOP = 44;

/** Radio de la ventana de la vitrina. */
export const WINDOW_RADIUS = 14;

/**
 * Caracteres de titular que sostiene cada marco.
 *
 * Son del contrato de composición y no de la presentación: el dominio los
 * duplica y los comprueba antes de gastar, igual que con las piezas de región.
 */
export const FRAME_TITLE_BUDGET: Readonly<Record<FrameLayoutId, number>> =
  Object.freeze({
    "marco-columna-derecha": 48,
    "marco-columna-izquierda": 48,
    "marco-etiqueta": 44,
    "marco-firma": 36,
    "marco-sello": 32,
    "marco-velo-inferior": 70,
    "marco-velo-superior": 56,
    "marco-vitrina": 60,
    "marco-zocalo": 70,
  });

export function tagWidthFor(format: DesignFormat): number {
  return format.id === "historia" ? 560 : 540;
}

export function sealDiameterFor(format: DesignFormat): number {
  if (format.id === "cuadrado") {
    return 520;
  }

  return format.id === "historia" ? 640 : 580;
}

type TitleSteps = readonly (readonly [maximumLength: number, size: number])[];

/**
 * Escalones del titular: hasta cuántos caracteres se usa cada tamaño.
 *
 * El último escalón llega exactamente al presupuesto del marco.
 */
const TITLE_STEPS: Readonly<Record<FrameLayoutId, TitleSteps>> = Object.freeze({
  "marco-columna-derecha": [
    [14, 68],
    [30, 60],
    [48, 52],
  ],
  "marco-columna-izquierda": [
    [14, 68],
    [30, 60],
    [48, 52],
  ],
  "marco-etiqueta": [
    [20, 58],
    [32, 52],
    [44, 46],
  ],
  "marco-firma": [
    [22, 52],
    [36, 44],
  ],
  "marco-sello": [
    [16, 58],
    [26, 50],
    [32, 44],
  ],
  "marco-velo-inferior": [
    [20, 92],
    [36, 80],
    [70, 68],
  ],
  "marco-velo-superior": [
    [20, 92],
    [36, 80],
    [56, 68],
  ],
  "marco-vitrina": [
    [26, 68],
    [44, 60],
    [60, 52],
  ],
  "marco-zocalo": [
    [24, 76],
    [44, 68],
    [70, 58],
  ],
});

/**
 * Marcos cuyo texto comparte el alto del lienzo con la foto: en un cuadrado
 * bajan un escalón para que la foto no quede reducida a una franja.
 */
const COMPACT_ON_SQUARE: ReadonlySet<FrameLayoutId> = new Set<FrameLayoutId>([
  "marco-velo-inferior",
  "marco-velo-superior",
  "marco-vitrina",
  "marco-zocalo",
]);

/**
 * Ancho medio de una mayúscula de Saira Condensed extrabold, en em, con margen
 * para las letras anchas.
 */
const DISPLAY_GLYPH_RATIO = 0.56;

const TITLE_MINIMUM_SIZE = 40;

function titleBoxWidth(layout: FrameLayoutId, format: DesignFormat): number {
  switch (layout) {
    case "marco-columna-derecha":
    case "marco-columna-izquierda":
      return COLUMN_WIDTH - format.safeArea.left - COLUMN_INNER_GUTTER;
    case "marco-etiqueta":
      return tagWidthFor(format) - 2 * TAG_PADDING;
    case "marco-firma":
      return FIRMA_TITLE_MAXIMUM_WIDTH;
    case "marco-sello":
      return sealDiameterFor(format) - 2 * SEAL_PADDING;
    case "marco-velo-inferior":
    case "marco-velo-superior":
    case "marco-vitrina":
    case "marco-zocalo":
      return format.width - format.safeArea.left - format.safeArea.right;
  }
}

/**
 * Tamaño del titular.
 *
 * Sale del escalón que corresponde al largo del texto y se acota para que la
 * palabra más larga entre en una línea: una palabra no se parte, así que es la
 * que decide si el titular se sale de su zona. Se elige al componer, antes de
 * que exista un render, igual que `composedTitleToken`.
 */
export function frameTitleSize(
  layout: FrameLayoutId,
  title: string,
  format: DesignFormat,
): number {
  const steps = TITLE_STEPS[layout];
  const matching = steps.findIndex(
    ([maximumLength]) => title.length <= maximumLength,
  );
  const stepIndex = matching === -1 ? steps.length - 1 : matching;
  const compact =
    format.height <= format.width && COMPACT_ON_SQUARE.has(layout) ? 1 : 0;
  const step = steps[Math.min(stepIndex + compact, steps.length - 1)];
  const bySteps = step === undefined ? TITLE_MINIMUM_SIZE : step[1];
  const longestWord = title
    .split(/\s+/u)
    .reduce((longest, word) => Math.max(longest, word.length), 0);
  const byWidth =
    longestWord === 0
      ? bySteps
      : Math.floor(
          titleBoxWidth(layout, format) / (longestWord * DISPLAY_GLYPH_RATIO),
        );

  return Math.max(TITLE_MINIMUM_SIZE, Math.min(bySteps, byWidth));
}
