import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COLORS,
  composedPanelColors,
  CONTRAST_THRESHOLDS,
  contrastRatio,
  meetsContrast,
  parseColor,
  relativeLuminance,
  THEME_IDS,
  themeFor,
  withAlpha,
} from "../../dist/index.js";

/**
 * El contraste de la capa determinista se demuestra, no se supone. Estas
 * pruebas fijan la fórmula contra valores conocidos y recorren cada tema para
 * que un cambio de paleta no baje la legibilidad sin que nadie se entere.
 */

test("la fórmula reproduce los valores de referencia de WCAG", () => {
  // Blanco sobre negro es el máximo posible: 21:1.
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000") * 100) / 100, 21);
  // Un color contra sí mismo no contrasta.
  assert.equal(contrastRatio("#e63b1e", "#e63b1e"), 1);
  // La luminancia relativa del blanco es 1 y la del negro 0.
  assert.equal(relativeLuminance(parseColor("#ffffff")), 1);
  assert.equal(relativeLuminance(parseColor("#000000")), 0);
});

test("un color translúcido se compone antes de medirse", () => {
  const opaque = contrastRatio(COLORS.paper, COLORS.ink);
  const translucent = contrastRatio(withAlpha(COLORS.paper, 0.72), COLORS.ink);

  // Bajar la opacidad acerca el texto al fondo: si el cálculo ignorara el alfa,
  // los dos valores serían iguales y estaríamos afirmando un contraste que la
  // pieza no tiene.
  assert.ok(translucent < opaque);
  assert.ok(translucent > 1);
});

test("el texto y el precio de cada tema superan el umbral sobre su panel", () => {
  for (const themeId of THEME_IDS) {
    const theme = themeFor(themeId);
    const panel = composedPanelColors(theme);

    assert.ok(
      meetsContrast(panel.text, panel.background),
      `El texto del tema ${themeId} no llega a ${String(CONTRAST_THRESHOLDS.text)}:1 sobre su panel.`,
    );
    assert.ok(
      meetsContrast(panel.muted, panel.background),
      `El texto atenuado del tema ${themeId} no llega al umbral sobre su panel.`,
    );
    assert.ok(
      meetsContrast(
        theme.colors.actionText,
        theme.colors.action,
        CONTRAST_THRESHOLDS.largeText,
      ),
      `El llamado a la acción del tema ${themeId} no llega al umbral de texto grande.`,
    );
  }
});

test("cada color de acción supera el umbral de texto normal", () => {
  for (const themeId of THEME_IDS) {
    const theme = themeFor(themeId);
    const measured = contrastRatio(
      theme.colors.actionText,
      theme.colors.action,
    );

    assert.ok(
      meetsContrast(theme.colors.actionText, theme.colors.action),
      `El botón de acción de ${themeId} mide ${measured.toFixed(2)}:1 y no llega al umbral de texto normal.`,
    );
  }
});

test("un color con forma desconocida se rechaza en lugar de degradarse a negro", () => {
  assert.throws(() => parseColor("rojo"), TypeError);
  assert.throws(() => parseColor("#abc"), TypeError);
});
