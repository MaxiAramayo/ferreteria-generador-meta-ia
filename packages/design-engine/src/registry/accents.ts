/**
 * Acento de las señales de una pieza: la etiqueta de estado y el botón de
 * contacto.
 *
 * `marca` deja que el tema decida con la paleta aprobada; `senal` y `verde`
 * son elecciones explícitas de quien opera (`ADR-030`). El documento nombra la
 * intención y el motor resuelve el color, igual que con los iconos.
 */

export type AccentName = "marca" | "senal" | "verde";

export const ACCENT_NAMES: readonly AccentName[] = Object.freeze([
  "marca",
  "senal",
  "verde",
]);

const accentNames: ReadonlySet<string> = new Set(ACCENT_NAMES);

export function isAccentName(value: unknown): value is AccentName {
  return typeof value === "string" && accentNames.has(value);
}
