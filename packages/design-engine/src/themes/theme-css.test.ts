import assert from "node:assert/strict";
import { test } from "node:test";

import { COLORS } from "../tokens/colors.ts";
import { FONT_ROLES, TYPOGRAPHY } from "../tokens/typography.ts";
import {
  THEME_COLOR_ROLES,
  THEMES,
  themeFor,
  type ThemeColors,
} from "./theme-colors.ts";
import {
  colorVariableName,
  designEngineStylesheet,
  fontVariableName,
  themeCssVariables,
} from "./theme-css.ts";
import { THEME_IDS } from "./themes.ts";

/**
 * Paridad entre tokens TypeScript y variables CSS.
 *
 * La hoja de estilos se genera desde los mismos objetos que consumen las
 * primitivas. Esta prueba impide que alguien agregue un color al CSS —o cambie
 * uno— sin pasar por los tokens.
 */

const tokenValues: ReadonlySet<string> = new Set(Object.values(COLORS));

test("cada tema define todos los roles de color", () => {
  for (const themeId of THEME_IDS) {
    const theme = themeFor(themeId);

    for (const role of THEME_COLOR_ROLES) {
      assert.ok(
        theme.colors[role].length > 0,
        `El tema ${themeId} no define ${role}.`,
      );
    }
  }
});

test("todo color de tema proviene de un token, opaco o con alfa", () => {
  for (const themeId of THEME_IDS) {
    const theme = themeFor(themeId);

    for (const role of THEME_COLOR_ROLES) {
      const value = theme.colors[role];

      if (value.startsWith("#")) {
        assert.ok(
          tokenValues.has(value),
          `El tema ${themeId} usa un hexadecimal fuera de los tokens en ${role}.`,
        );
        continue;
      }

      assert.match(
        value,
        /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [\d.]+\)$/u,
        `El tema ${themeId} usa un color no derivado de tokens en ${role}.`,
      );
    }
  }
});

test("las variables CSS reproducen exactamente los valores de los tokens", () => {
  for (const themeId of THEME_IDS) {
    const theme = themeFor(themeId);
    const variables = themeCssVariables(theme);

    assert.equal(
      Object.keys(variables).length,
      THEME_COLOR_ROLES.length,
      `El tema ${themeId} genera una cantidad de variables distinta a sus roles.`,
    );

    for (const role of THEME_COLOR_ROLES) {
      assert.equal(
        variables[colorVariableName(role)],
        theme.colors[role],
        `La variable de ${role} no coincide con el token en ${themeId}.`,
      );
    }
  }
});

test("el nombre de la variable traduce el rol a kebab-case", () => {
  const role: keyof ThemeColors = "actionText";

  assert.equal(colorVariableName(role), "--aramayo-color-action-text");
  assert.equal(colorVariableName("background"), "--aramayo-color-background");
  assert.equal(fontVariableName("display"), "--aramayo-font-display");
});

test("la hoja de estilos declara fuentes y un bloque por tema", () => {
  const stylesheet = designEngineStylesheet();

  for (const role of FONT_ROLES) {
    assert.ok(
      stylesheet.includes(
        `${fontVariableName(role)}: ${TYPOGRAPHY[role].cssStack};`,
      ),
    );
  }

  for (const themeId of THEME_IDS) {
    assert.ok(
      stylesheet.includes(`[data-theme="${themeId}"] {`),
      `Falta el bloque del tema ${themeId}.`,
    );

    for (const role of THEME_COLOR_ROLES) {
      assert.ok(
        stylesheet.includes(
          `  ${colorVariableName(role)}: ${THEMES[themeId].colors[role]};`,
        ),
        `Falta ${role} del tema ${themeId} en la hoja de estilos.`,
      );
    }
  }
});
