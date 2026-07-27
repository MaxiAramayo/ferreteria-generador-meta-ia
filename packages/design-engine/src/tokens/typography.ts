/**
 * Tipografía de marca.
 *
 * `display` compone titulares condensados en mayúscula; `body` resuelve texto
 * corrido y etiquetas. Las familias, sus pesos y su licencia quedan declarados
 * acá para que migrar o auditar una fuente no requiera leer los layouts.
 */

export interface FontFamilyToken {
  /** Pila CSS completa, con reservas del sistema. */
  readonly cssStack: string;
  readonly family: string;
  readonly license: string;
  /** Paquete que provee los archivos de fuente. */
  readonly package: string;
  readonly weights: readonly number[];
}

export type FontRole = "body" | "display";

export const TYPOGRAPHY: Readonly<Record<FontRole, FontFamilyToken>> =
  Object.freeze({
    body: Object.freeze({
      cssStack: '"Archivo", system-ui, sans-serif',
      family: "Archivo",
      license: "OFL-1.1",
      package: "@fontsource/archivo",
      weights: Object.freeze([400, 500, 600, 700, 800]),
    }),
    display: Object.freeze({
      cssStack: '"Saira Condensed", "Archivo", system-ui, sans-serif',
      family: "Saira Condensed",
      license: "OFL-1.1",
      package: "@fontsource/saira-condensed",
      weights: Object.freeze([500, 600, 700, 800, 900]),
    }),
  });

export const FONT_ROLES: readonly FontRole[] = Object.freeze([
  "body",
  "display",
]);

export const FONT_WEIGHTS = Object.freeze({
  black: 900,
  bold: 700,
  extrabold: 800,
  medium: 500,
  semibold: 600,
});

export type FontWeightToken = keyof typeof FONT_WEIGHTS;

export interface TypeStyle {
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacing: number;
  readonly lineHeight: number;
  readonly role: FontRole;
  readonly textTransform: "none" | "uppercase";
}

/**
 * Escala tipográfica de las piezas, en píxeles del canvas de 1080 de ancho.
 * Reproduce `TYPE` de `src/layouts/kit.tsx`.
 */
export type TypeStyleToken = "body" | "h1" | "h2" | "hero" | "label" | "sub";

export const TYPE_SCALE: Readonly<Record<TypeStyleToken, TypeStyle>> =
  Object.freeze({
    body: Object.freeze({
      fontSize: 31,
      fontWeight: FONT_WEIGHTS.medium,
      letterSpacing: 0,
      lineHeight: 1.32,
      role: "body",
      textTransform: "none",
    }),
    h1: Object.freeze({
      fontSize: 92,
      fontWeight: FONT_WEIGHTS.extrabold,
      letterSpacing: 0,
      lineHeight: 0.86,
      role: "display",
      textTransform: "uppercase",
    }),
    h2: Object.freeze({
      fontSize: 68,
      fontWeight: FONT_WEIGHTS.extrabold,
      letterSpacing: 0,
      lineHeight: 0.9,
      role: "display",
      textTransform: "uppercase",
    }),
    hero: Object.freeze({
      fontSize: 150,
      fontWeight: FONT_WEIGHTS.black,
      letterSpacing: 0,
      lineHeight: 0.8,
      role: "display",
      textTransform: "uppercase",
    }),
    label: Object.freeze({
      fontSize: 24,
      fontWeight: FONT_WEIGHTS.extrabold,
      letterSpacing: 0,
      lineHeight: 1,
      role: "body",
      textTransform: "uppercase",
    }),
    sub: Object.freeze({
      fontSize: 38,
      fontWeight: FONT_WEIGHTS.semibold,
      letterSpacing: 0,
      lineHeight: 1.18,
      role: "body",
      textTransform: "none",
    }),
  });

const fontRoles: ReadonlySet<string> = new Set(FONT_ROLES);

export function isFontRole(value: string): value is FontRole {
  return fontRoles.has(value);
}
