/**
 * Contraste de la capa determinista.
 *
 * Existe porque `P4-T05` compone texto comercial encima de una imagen que
 * generó un modelo: sin una regla medible, «se lee bien» queda librado a quien
 * mira la pieza. La regla que sostiene esta tarea es que el texto **nunca** se
 * apoya en píxeles generados, sino en un panel de marca de color conocido, así
 * que el contraste se puede calcular entre dos tokens antes de renderizar nada.
 *
 * El cálculo es el de WCAG 2.2: luminancia relativa con la linealización sRGB y
 * un cociente sobre 0,05. No se aproxima con brillo percibido porque el umbral
 * que hay que demostrar está definido sobre esta fórmula y no sobre otra.
 *
 * Un color con transparencia se compone antes de medir: `muted` es
 * `rgba(paper, 0.72)` y medirlo como si fuera opaco daría un contraste que la
 * pieza no tiene.
 */

import { COLORS } from "./colors.ts";

export interface ColorChannels {
  /** De 0 a 1. Un color opaco vale 1. */
  readonly alpha: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

const hexPattern = /^#?([0-9a-f]{6})$/iu;
const rgbPattern =
  /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/iu;

function channelFromHex(value: string, start: number): number {
  return Number.parseInt(value.slice(start, start + 2), 16);
}

/**
 * Acepta las dos formas que produce el motor: hexadecimal de los tokens y
 * `rgba(...)` de `withAlpha`. Cualquier otra forma es un error de programación,
 * no un dato de entrada, así que se rechaza en lugar de degradar a negro.
 */
export function parseColor(color: string): ColorChannels {
  const hex = hexPattern.exec(color.trim());

  if (hex !== null) {
    const digits = hex[1] ?? "";

    return Object.freeze({
      alpha: 1,
      blue: channelFromHex(digits, 4),
      green: channelFromHex(digits, 2),
      red: channelFromHex(digits, 0),
    });
  }

  const rgb = rgbPattern.exec(color.trim());

  if (rgb === null) {
    throw new TypeError(`El color no tiene una forma reconocible: ${color}`);
  }

  const alpha = rgb[4];

  return Object.freeze({
    alpha: alpha === undefined ? 1 : Number.parseFloat(alpha),
    blue: Number.parseInt(rgb[3] ?? "0", 10),
    green: Number.parseInt(rgb[2] ?? "0", 10),
    red: Number.parseInt(rgb[1] ?? "0", 10),
  });
}

/**
 * Compone un color sobre un fondo opaco. Es lo que hace el navegador al pintar
 * una capa translúcida, y es lo que hay que medir.
 */
export function flatten(
  foreground: ColorChannels,
  background: ColorChannels,
): ColorChannels {
  if (foreground.alpha >= 1) {
    return foreground;
  }

  const mix = (front: number, back: number): number =>
    front * foreground.alpha + back * (1 - foreground.alpha);

  return Object.freeze({
    alpha: 1,
    blue: mix(foreground.blue, background.blue),
    green: mix(foreground.green, background.green),
    red: mix(foreground.red, background.red),
  });
}

function linearize(channel: number): number {
  const normalized = channel / 255;

  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: ColorChannels): number {
  return (
    0.2126 * linearize(color.red) +
    0.7152 * linearize(color.green) +
    0.0722 * linearize(color.blue)
  );
}

/**
 * Cociente de contraste entre dos colores.
 *
 * El fondo se toma opaco: si trae transparencia, se compone antes sobre
 * `beneath`, que por defecto es el lienzo. Sin ese paso, un panel translúcido
 * mediría contra sí mismo en lugar de contra lo que hay debajo.
 */
export function contrastRatio(
  foreground: string,
  background: string,
  beneath: string = COLORS.ink,
): number {
  const base = flatten(parseColor(background), parseColor(beneath));
  const front = flatten(parseColor(foreground), base);
  const lighter = Math.max(relativeLuminance(front), relativeLuminance(base));
  const darker = Math.min(relativeLuminance(front), relativeLuminance(base));

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Umbrales aprobados para la composición.
 *
 * `text` es el AA de WCAG para texto normal, y es la barra del copy de la
 * pieza —titular, bajada y precio—. Se le exige a todo ese texto y no sólo al
 * chico: una pieza se mira en un teléfono, a veces con reflejo y a escala
 * reducida, y el margen extra no cuesta nada porque el color de fondo del panel
 * lo elegimos nosotros.
 *
 * `largeText` es la excepción de WCAG para tipografía grande en negrita, y acá
 * cubre un solo elemento: el botón de acción. El verde de WhatsApp con texto
 * blanco mide 4,38:1, así que supera `largeText` y queda 0,12 por debajo de
 * `text`. No se corrige acá: ese verde es identidad aprobada en `P1-T06` y lo
 * usan las dieciocho piezas del catálogo, así que cambiarlo es una decisión de
 * marca y no un ajuste de esta tarea. El umbral separado deja el dato a la
 * vista en lugar de esconderlo bajando la barra general.
 */
export const CONTRAST_THRESHOLDS = Object.freeze({
  largeText: 3,
  /** Elementos no textuales: bordes, íconos y separadores. */
  nonText: 3,
  text: 4.5,
});

export function meetsContrast(
  foreground: string,
  background: string,
  minimum: number = CONTRAST_THRESHOLDS.text,
  beneath?: string,
): boolean {
  return contrastRatio(foreground, background, beneath) >= minimum;
}
