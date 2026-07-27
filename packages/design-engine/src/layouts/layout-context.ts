import type {
  DesignContent,
  DesignDocument,
  MediaAsset,
} from "../contracts/document.ts";
import type { DesignFormat } from "../formats/formats.ts";
import type { Theme } from "../themes/theme-colors.ts";

/**
 * Contexto de composición.
 *
 * Un layout no conoce el teléfono ni la dirección de Aramayo: los recibe. Los
 * datos comerciales cambian con el negocio y viven en
 * `@aramayo/brand-knowledge`; el motor sólo sabe dónde ubicarlos.
 */

export interface LayoutBrandProfile {
  readonly branch: string;
  readonly central: string;
  readonly city: string;
  readonly name: string;
  readonly phone: string;
  readonly shortName: string;
}

export interface LayoutContext {
  /** Base pública desde la que se sirven los activos del motor. */
  readonly assetBaseUrl: string;
  readonly brand: LayoutBrandProfile;
}

export interface LayoutProps {
  readonly content: DesignContent;
  readonly context: LayoutContext;
  readonly document: DesignDocument;
  readonly format: DesignFormat;
  readonly theme: Theme;
}

export function mediaAt(
  document: DesignDocument,
  index: number,
): MediaAsset | undefined {
  return document.media[index];
}

/**
 * Sucursal a mostrar al pie: la declarada en la pieza o la que corresponde a la
 * rama de marca del tema.
 */
export function footerBranch(
  content: DesignContent,
  context: LayoutContext,
  theme: Theme,
): string {
  if (content.branch !== undefined) {
    return content.branch;
  }

  return theme.brand === "lubricentro"
    ? `Casa Central · ${context.brand.central}`
    : `Sucursal · ${context.brand.branch}`;
}
