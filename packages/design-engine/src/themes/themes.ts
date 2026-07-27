/**
 * Identidad de los temas visuales.
 *
 * `P1-T02` fija los identificadores, la rama de marca y el tono, porque la
 * validación de documentos los necesita. Los valores concretos de color,
 * tipografía y bindings CSS se migran en `P1-T03` sobre estos mismos
 * identificadores.
 */

export type ThemeId = "taller" | "claro" | "promo" | "lubricentro";

export type BrandBranch = "ferreteria" | "lubricentro";

export type ThemeTone = "dark" | "light";

export interface ThemeDescriptor {
  readonly brand: BrandBranch;
  readonly id: ThemeId;
  readonly tone: ThemeTone;
}

export const THEME_DESCRIPTORS: Readonly<Record<ThemeId, ThemeDescriptor>> =
  Object.freeze({
    claro: Object.freeze({ brand: "ferreteria", id: "claro", tone: "light" }),
    lubricentro: Object.freeze({
      brand: "lubricentro",
      id: "lubricentro",
      tone: "dark",
    }),
    promo: Object.freeze({ brand: "ferreteria", id: "promo", tone: "dark" }),
    taller: Object.freeze({ brand: "ferreteria", id: "taller", tone: "dark" }),
  });

export const THEME_IDS: readonly ThemeId[] = Object.freeze([
  "taller",
  "claro",
  "promo",
  "lubricentro",
]);

/**
 * Tema por defecto del generador congelado. Se aplica cuando el documento no
 * declara uno, nunca para reemplazar un identificador inválido: un tema
 * desconocido es un error de validación explícito.
 */
export const DEFAULT_THEME_ID: ThemeId = "taller";

const themeIds: ReadonlySet<string> = new Set(THEME_IDS);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && themeIds.has(value);
}

export function themeDescriptorFor(themeId: ThemeId): ThemeDescriptor {
  return THEME_DESCRIPTORS[themeId];
}
