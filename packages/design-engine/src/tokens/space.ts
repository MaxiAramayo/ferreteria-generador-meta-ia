/**
 * Espaciado y radios.
 *
 * La escala reproduce los valores usados por las piezas congeladas: márgenes de
 * canvas, separaciones entre bloques y radios de tarjetas, chips y botones.
 * Existe para que un layout no vuelva a escribir `p-[72px]` ni `rounded-[28px]`
 * como valor suelto.
 */

export const SPACING = Object.freeze({
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 36,
  xxl: 44,
  gutter: 72,
});

export type SpacingToken = keyof typeof SPACING;

export const RADII = Object.freeze({
  card: 28,
  chip: 16,
  icon: 20,
  none: 0,
  photo: 32,
  pill: 9999,
  sm: 10,
});

export type RadiusToken = keyof typeof RADII;

/**
 * Grosores de trazo de iconos y marca. El generador usaba `2.4`, `2.6` y `3`
 * según el contexto; se conservan con nombre.
 */
export const STROKES = Object.freeze({
  emphasis: 3,
  icon: 2.4,
  iconBadge: 2.6,
});

export type StrokeToken = keyof typeof STROKES;
