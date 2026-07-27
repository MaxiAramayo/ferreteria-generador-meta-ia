/**
 * Paleta canónica de Aramayo.
 *
 * Los valores provienen de `src/index.css` del generador congelado en `P1-T01`.
 * Es la única definición de color del motor: ningún layout, primitiva ni tema
 * escribe un hexadecimal propio.
 */

export const COLORS = Object.freeze({
  cream: "#e7e2db",
  ferre: "#e63b1e",
  ferreDeep: "#b62a12",
  graphite: "#141414",
  graphiteDeep: "#0d0d0d",
  humo: "#2a2a2a",
  ink: "#1c1a19",
  inkSoft: "#3a3734",
  lubri: "#ffb200",
  lubriDeep: "#e59400",
  paper: "#f6f1ea",
  rust: "#e63b1e",
  rustDeep: "#b62a12",
  safety: "#ffb200",
  safetyDeep: "#e59400",
  steel: "#6e6a66",
  whatsapp: "#1f8a4c",
  white: "#ffffff",
});

export type ColorToken = keyof typeof COLORS;

/**
 * Componentes RGB de los colores usados en degradados y velos.
 *
 * Se derivan del mismo hexadecimal: evita reescribir `230,59,30` a mano en cada
 * capa translúcida, como ocurría en el generador.
 */
export function rgbChannels(color: string): readonly [number, number, number] {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return [red, green, blue];
}

export function withAlpha(color: string, alpha: number): string {
  const [red, green, blue] = rgbChannels(color);

  return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(alpha)})`;
}
