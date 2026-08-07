import { COLORS, withAlpha } from "../tokens/colors.ts";
import {
  THEME_DESCRIPTORS,
  type ThemeDescriptor,
  type ThemeId,
} from "./themes.ts";

/**
 * Resolución de temas a color.
 *
 * El generador expresaba cada rol como una clase de Tailwind (`bg-ink`,
 * `text-paper/72`). Acá cada rol es un color derivado de los tokens: el motor
 * ya no depende de un framework de CSS para saber de qué color es una pieza.
 *
 * `primary` y `accent` se usaban también como color de texto con la misma tinta;
 * por eso hay un único valor por rol y no una variante de texto por cada uno.
 */

export interface ThemeColors {
  /** Color del botón de acción: WhatsApp o consulta. */
  readonly action: string;
  readonly actionText: string;
  readonly accent: string;
  readonly background: string;
  readonly border: string;
  readonly highlight: string;
  readonly muted: string;
  readonly primary: string;
  readonly surface: string;
  readonly text: string;
}

export interface Theme extends ThemeDescriptor {
  readonly colors: ThemeColors;
}

const THEME_COLORS: Readonly<Record<ThemeId, ThemeColors>> = Object.freeze({
  claro: Object.freeze({
    accent: COLORS.ink,
    action: COLORS.whatsapp,
    actionText: COLORS.white,
    background: COLORS.paper,
    border: withAlpha(COLORS.ink, 0.12),
    highlight: COLORS.rust,
    muted: withAlpha(COLORS.ink, 0.62),
    primary: COLORS.rust,
    surface: COLORS.paper,
    text: COLORS.ink,
  }),
  lubricentro: Object.freeze({
    accent: COLORS.rust,
    action: COLORS.whatsapp,
    actionText: COLORS.white,
    background: COLORS.graphite,
    border: withAlpha(COLORS.white, 0.12),
    highlight: COLORS.safety,
    muted: withAlpha(COLORS.paper, 0.7),
    primary: COLORS.safety,
    surface: COLORS.humo,
    text: COLORS.paper,
  }),
  promo: Object.freeze({
    accent: COLORS.safety,
    action: COLORS.whatsapp,
    actionText: COLORS.white,
    background: COLORS.rust,
    border: withAlpha(COLORS.white, 0.22),
    highlight: COLORS.safety,
    muted: withAlpha(COLORS.white, 0.76),
    primary: COLORS.ink,
    surface: COLORS.paper,
    text: COLORS.white,
  }),
  taller: Object.freeze({
    accent: COLORS.safety,
    action: COLORS.whatsapp,
    actionText: COLORS.white,
    background: COLORS.ink,
    border: withAlpha(COLORS.white, 0.14),
    highlight: COLORS.rust,
    muted: withAlpha(COLORS.paper, 0.72),
    primary: COLORS.rust,
    surface: COLORS.paper,
    text: COLORS.paper,
  }),
});

export const THEMES: Readonly<Record<ThemeId, Theme>> = Object.freeze({
  claro: Object.freeze({
    ...THEME_DESCRIPTORS.claro,
    colors: THEME_COLORS.claro,
  }),
  lubricentro: Object.freeze({
    ...THEME_DESCRIPTORS.lubricentro,
    colors: THEME_COLORS.lubricentro,
  }),
  promo: Object.freeze({
    ...THEME_DESCRIPTORS.promo,
    colors: THEME_COLORS.promo,
  }),
  taller: Object.freeze({
    ...THEME_DESCRIPTORS.taller,
    colors: THEME_COLORS.taller,
  }),
});

export const THEME_COLOR_ROLES: readonly (keyof ThemeColors)[] = Object.freeze([
  "accent",
  "action",
  "actionText",
  "background",
  "border",
  "highlight",
  "muted",
  "primary",
  "surface",
  "text",
]);

export function themeFor(themeId: ThemeId): Theme {
  return THEMES[themeId];
}

export interface ComposedPanelColors {
  readonly background: string;
  readonly muted: string;
  readonly text: string;
}

/**
 * Paleta del panel de composición (`P4-T05`).
 *
 * El panel no hereda el fondo del tema y esa es la decisión, no un descuido: el
 * tema `promo` pinta el lienzo de rojo, y su texto blanco encima mide 4,19:1 y
 * su texto atenuado 2,97:1. Sobre un lienzo entero, con la pieza como fondo,
 * eso pasa; sobre el bloque que lleva el precio y el llamado a la acción, no.
 *
 * El panel usa siempre el par tinta/papel del tono, que mide 15,43:1, y deja
 * que el tema siga decidiendo lo que sí es identidad: el acento de la etiqueta
 * y el color del botón. La marca se reconoce igual y el dato comercial se lee
 * siempre.
 */
export function composedPanelColors(theme: Theme): ComposedPanelColors {
  return theme.tone === "light"
    ? Object.freeze({
        background: COLORS.paper,
        muted: withAlpha(COLORS.ink, 0.72),
        text: COLORS.ink,
      })
    : Object.freeze({
        background: COLORS.ink,
        muted: withAlpha(COLORS.paper, 0.78),
        text: COLORS.paper,
      });
}
