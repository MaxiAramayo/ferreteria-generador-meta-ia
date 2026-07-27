/**
 * Definición canónica de formatos y zonas seguras.
 *
 * Este módulo es la única fuente de dimensiones del motor. Ningún layout,
 * aplicación ni herramienta puede redeclarar un ancho, un alto o un margen
 * seguro: los consume desde acá.
 *
 * Los valores provienen de la línea base congelada en `P1-T01`
 * (`baseline/manifest.json`), no de memoria.
 */

export type FormatId =
  "feed" | "cuadrado" | "historia" | "banner-fb" | "destacada";

export interface SafeArea {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/**
 * Recorte circular de las portadas destacadas de Instagram. Sólo los formatos
 * que se recortan en círculo lo declaran.
 */
export interface CircularSafeArea extends SafeArea {
  readonly circleDiameter: number;
}

export interface DesignFormat {
  readonly height: number;
  readonly id: FormatId;
  readonly label: string;
  readonly platform: string;
  readonly ratio: string;
  readonly safeArea: CircularSafeArea | SafeArea;
  readonly width: number;
}

const feedSafeArea: SafeArea = Object.freeze({
  bottom: 72,
  left: 72,
  right: 72,
  top: 72,
});

const storySafeArea: SafeArea = Object.freeze({
  bottom: 300,
  left: 72,
  right: 72,
  top: 250,
});

export const FORMATS: Readonly<Record<FormatId, DesignFormat>> = Object.freeze({
  "banner-fb": Object.freeze({
    height: 624,
    id: "banner-fb",
    label: "Banner Facebook",
    platform: "Portada Facebook",
    ratio: "~21:8",
    safeArea: Object.freeze({ bottom: 48, left: 280, right: 280, top: 48 }),
    width: 1640,
  }),
  cuadrado: Object.freeze({
    height: 1080,
    id: "cuadrado",
    label: "Cuadrado 1:1",
    platform: "Instagram · Facebook",
    ratio: "1:1",
    safeArea: feedSafeArea,
    width: 1080,
  }),
  destacada: Object.freeze({
    height: 1080,
    id: "destacada",
    label: "Portada destacada",
    platform: "Instagram Highlights",
    ratio: "1:1",
    safeArea: Object.freeze({
      bottom: 110,
      circleDiameter: 860,
      left: 110,
      right: 110,
      top: 110,
    }),
    width: 1080,
  }),
  feed: Object.freeze({
    height: 1350,
    id: "feed",
    label: "Post feed 4:5",
    platform: "Instagram · Facebook",
    ratio: "4:5",
    safeArea: feedSafeArea,
    width: 1080,
  }),
  historia: Object.freeze({
    height: 1920,
    id: "historia",
    label: "Historia 9:16",
    platform: "Stories · Reels",
    ratio: "9:16",
    safeArea: storySafeArea,
    width: 1080,
  }),
});

export const FORMAT_IDS: readonly FormatId[] = Object.freeze([
  "feed",
  "cuadrado",
  "historia",
  "banner-fb",
  "destacada",
]);

const formatIds: ReadonlySet<string> = new Set(FORMAT_IDS);

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === "string" && formatIds.has(value);
}

export function formatFor(formatId: FormatId): DesignFormat {
  return FORMATS[formatId];
}

export function hasCircularSafeArea(
  format: DesignFormat,
): format is DesignFormat & { readonly safeArea: CircularSafeArea } {
  return "circleDiameter" in format.safeArea;
}
