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
 * Sucursal a mostrar al pie: la declarada en la pieza o, si no declara ninguna,
 * la casa central.
 *
 * Antes lo decidía el tema, así que una pieza sin sucursal declarada afirmaba
 * «Sucursal · Rivadavia 673» aunque su copy hablara de casa central: el render
 * elegía una dirección que nadie había pedido. Cuando la pieza no dice de qué
 * sucursal habla, la casa central es la única respuesta que el negocio dio por
 * omisión.
 */
export function footerBranch(
  content: DesignContent,
  context: LayoutContext,
): string {
  if (content.branch !== undefined) {
    return content.branch;
  }

  return `Casa Central · ${context.brand.central}`;
}
