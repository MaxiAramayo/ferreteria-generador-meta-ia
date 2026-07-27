import type { FormatId } from "../formats/formats.ts";
import type { IconName } from "../registry/icons.ts";
import type { LayoutId } from "../registry/layout-id.ts";
import type { ThemeId } from "../themes/themes.ts";

/**
 * Documento de diseño: la única entrada válida del motor.
 *
 * Es un valor puro y serializable. No conoce React, Playwright, disco, red ni
 * base de datos, y no transporta el copy de la publicación: el caption y los
 * hashtags pertenecen al contrato de contenido de la plataforma, no a la
 * composición visual.
 */

/**
 * Versión del esquema del documento.
 *
 * Un documento persistido conserva la versión con la que fue creado. Cuando el
 * contrato cambie de forma incompatible, esta constante sube y el motor podrá
 * migrar o rechazar documentos viejos de manera explícita.
 */
export const DESIGN_SCHEMA_VERSION = 1;

export type DesignSchemaVersion = typeof DESIGN_SCHEMA_VERSION;

/**
 * Referencia a un activo.
 *
 * Nunca es una ruta local ni un nombre de archivo del generador anterior:
 * `brand-library` nombra un activo aprobado del inventario y `remote` una URL
 * pública HTTPS. Resolver la referencia a bytes es trabajo del adaptador de
 * medios, fuera de este contrato.
 */
export type AssetReference =
  | { readonly assetId: string; readonly source: "brand-library" }
  | { readonly source: "remote"; readonly url: string };

export type MediaFit = "contain" | "cover";

export interface MediaFocus {
  /** Porcentaje horizontal del punto de interés, de 0 a 100. */
  readonly x: number;
  /** Porcentaje vertical del punto de interés, de 0 a 100. */
  readonly y: number;
}

export interface MediaAsset {
  /** Texto alternativo obligatorio: la accesibilidad no es opcional. */
  readonly alt: string;
  readonly fit: MediaFit;
  readonly focus: MediaFocus;
  readonly reference: AssetReference;
  readonly zoom: number;
}

export interface DesignContent {
  readonly badge?: string;
  readonly branch?: string;
  readonly callToAction?: string;
  readonly category?: string;
  readonly icon?: IconName;
  readonly items?: readonly string[];
  readonly phone?: string;
  readonly previousPrice?: string;
  readonly price?: string;
  readonly subtitle?: string;
  readonly title: string;
  readonly validity?: string;
}

export interface DesignDocument {
  readonly content: DesignContent;
  readonly format: FormatId;
  readonly layout: LayoutId;
  readonly media: readonly MediaAsset[];
  readonly schemaVersion: DesignSchemaVersion;
  /** Identificador estable de la pieza dentro de la plataforma. */
  readonly slug: string;
  readonly theme: ThemeId;
}

export const mediaDefaults: Readonly<
  Pick<MediaAsset, "fit" | "focus" | "zoom">
> = Object.freeze({
  fit: "cover",
  focus: Object.freeze({ x: 50, y: 50 }),
  zoom: 1,
});

export const mediaLimits = Object.freeze({
  focusMaximum: 100,
  focusMinimum: 0,
  zoomMaximum: 4,
  zoomMinimum: 0.5,
});

export const contentLimits = Object.freeze({
  itemsMaximum: 8,
  slugPattern: /^[a-z0-9][a-z0-9-]{2,63}$/u,
  textMaximum: 240,
});
