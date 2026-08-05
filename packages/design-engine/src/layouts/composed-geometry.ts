import type { DesignFormat } from "../formats/formats.ts";

/**
 * Geometría de la región reservada, del lado del motor.
 *
 * El prompt visual le pide al modelo que deje limpio un rectángulo en
 * coordenadas exactas; la capa determinista tiene que escribir **sobre ese
 * mismo rectángulo**, o el lazo que abrió `P4-T01` queda sin cerrar.
 *
 * La fórmula está declarada dos veces —acá y en `reservedRectangleFor` de
 * `@aramayo/domain`— porque el motor de diseño no depende del dominio ni el
 * dominio del motor. Es el mismo trato que ya reciben los formatos: se duplica
 * la declaración y el worker comprueba que ambas coincidan, en su caso con una
 * prueba que recorre cada región en cada formato. Si alguien cambia una sola,
 * esa prueba falla.
 *
 * `left_column` no figura: ningún perfil visual aprobado la usa y
 * `PIECE-CATALOG.md` no admite una pieza sin objetivo comercial. El mapeo del
 * worker la rechaza de forma explícita en lugar de caer en otro layout.
 */

export type ComposedRegion = "center_circle" | "lower_third" | "upper_band";

export interface ComposedPanelRect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export function composedPanelRect(
  region: ComposedRegion,
  format: DesignFormat,
): ComposedPanelRect {
  const left = format.safeArea.left;
  const top = format.safeArea.top;
  const usableWidth = format.width - left - format.safeArea.right;
  const usableHeight = format.height - top - format.safeArea.bottom;

  switch (region) {
    case "upper_band":
      return Object.freeze({
        height: Math.round(usableHeight * 0.28),
        width: usableWidth,
        x: left,
        y: top,
      });
    case "lower_third": {
      const height = Math.round(usableHeight / 3);

      return Object.freeze({
        height,
        width: usableWidth,
        x: left,
        y: top + usableHeight - height,
      });
    }
    case "center_circle": {
      const side = Math.round(Math.min(usableWidth, usableHeight) * 0.6);

      return Object.freeze({
        height: side,
        width: side,
        x: left + Math.round((usableWidth - side) / 2),
        y: top + Math.round((usableHeight - side) / 2),
      });
    }
  }
}

/**
 * Cuántos caracteres de titular sostiene cada región.
 *
 * Un tercio inferior es alto y ancho; una banda superior es ancha y baja, y no
 * puede dar tres renglones de titular sin comerse el llamado a la acción. Los
 * topes son del contrato de composición, no de la presentación: quien arma la
 * pieza los comprueba antes de gastar una llamada al proveedor, no después.
 */
export const COMPOSED_TITLE_BUDGET: Readonly<Record<ComposedRegion, number>> =
  Object.freeze({
    center_circle: 44,
    lower_third: 70,
    upper_band: 56,
  });

/**
 * Alto que necesita un tercio inferior para además llevar bajada.
 *
 * Sale de sumar los bloques que el panel apila: encabezado con logo (48),
 * titular en su escalón más alto (79), bajada de un renglón (41), fila de
 * precio con vigencia (83), los tres espacios entre ellos (36) y el relleno del
 * panel (56). Da 343; el piso queda en 360 para no depender del redondeo de una
 * fuente.
 *
 * Debajo de eso la bajada no entra, y el formato cuadrado está debajo: su
 * tercio inferior mide 312 px. Sin esta regla el precio y el llamado a la
 * acción se salían del panel y quedaban apoyados sobre la imagen generada, que
 * es exactamente lo que la pieza evita.
 */
export const composedSubtitleMinimumHeight = 360;

export function composedPanelShowsSubtitle(rect: ComposedPanelRect): boolean {
  return rect.height >= composedSubtitleMinimumHeight;
}

/**
 * Alto a partir del cual el logo puede llevar su descriptor.
 *
 * El isotipo mide 48; con el nombre y la ciudad al lado, la fila crece a 74.
 * Esos 26 px extra son la diferencia entre que el titular entre en dos
 * renglones o empuje el precio fuera del panel en los formatos chicos. La
 * identidad la sostiene el isotipo, que se dibuja siempre.
 */
export const composedDescriptorMinimumHeight = 340;

export function composedPanelShowsDescriptor(rect: ComposedPanelRect): boolean {
  return rect.height >= composedDescriptorMinimumHeight;
}

/**
 * Escalón tipográfico del titular.
 *
 * Depende de tres cosas y no de una: cuánto texto hay, en qué región va y qué
 * alto tiene el panel. El alto es el que faltaba: el mismo titular de diecisiete
 * caracteres entra en un renglón de `h1` en un tercio inferior de feed —402 px—
 * y ocupa dos en uno de cuadrado —312 px—, donde ya no queda lugar para el
 * precio. Medirlo en un navegador no es una opción: el escalón se elige al
 * componer, antes de que exista ningún render.
 *
 * Bajar el escalón es determinista y reproducible; el rechazo por presupuesto
 * queda para el caso en que ni el más chico alcanza.
 */
export function composedTitleToken(
  length: number,
  region: ComposedRegion,
  rect: ComposedPanelRect,
): "h1" | "h2" | "sub" {
  if (rect.height >= 400) {
    if (length <= 20) {
      return region === "lower_third" ? "h1" : "h2";
    }
    return region === "lower_third" && length <= 44 ? "h2" : "sub";
  }

  return rect.height >= 300 && length <= 20 ? "h2" : "sub";
}
