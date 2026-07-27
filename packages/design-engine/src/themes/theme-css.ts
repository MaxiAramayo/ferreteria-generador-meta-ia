import { FONT_ROLES, TYPOGRAPHY, type FontRole } from "../tokens/typography.ts";
import {
  THEME_COLOR_ROLES,
  THEMES,
  type Theme,
  type ThemeColors,
} from "./theme-colors.ts";
import { THEME_IDS, type ThemeId } from "./themes.ts";

/**
 * Bindings CSS derivados de los tokens.
 *
 * No existe una paleta escrita a mano en CSS: la hoja de estilos se genera
 * desde los mismos objetos que consumen las primitivas, y una prueba comprueba
 * la paridad. Sirve para el harness del panel y para el documento que renderiza
 * el worker.
 */

const variablePrefix = "--aramayo";

export function colorVariableName(role: keyof ThemeColors): string {
  const kebabRole = role.replace(
    /[A-Z]/gu,
    (letter) => `-${letter.toLowerCase()}`,
  );

  return `${variablePrefix}-color-${kebabRole}`;
}

export function fontVariableName(role: FontRole): string {
  return `${variablePrefix}-font-${role}`;
}

export function themeCssVariables(
  theme: Theme,
): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};

  for (const role of THEME_COLOR_ROLES) {
    variables[colorVariableName(role)] = theme.colors[role];
  }

  return Object.freeze(variables);
}

function declarationsFor(theme: Theme): string {
  return Object.entries(themeCssVariables(theme))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
}

/**
 * Hoja de estilos del motor: familias tipográficas y un bloque por tema,
 * seleccionable con `data-theme`.
 */
export function designEngineStylesheet(): string {
  const fontDeclarations = FONT_ROLES.map(
    (role) => `  ${fontVariableName(role)}: ${TYPOGRAPHY[role].cssStack};`,
  ).join("\n");

  const themeBlocks = THEME_IDS.map(
    (themeId: ThemeId) =>
      `[data-theme="${themeId}"] {\n${declarationsFor(THEMES[themeId])}\n}`,
  ).join("\n\n");

  return `:root {\n${fontDeclarations}\n}\n\n${themeBlocks}\n`;
}
