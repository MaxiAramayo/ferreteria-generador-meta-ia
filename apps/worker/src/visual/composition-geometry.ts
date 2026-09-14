/**
 * Medición de la pieza compuesta dentro del navegador.
 *
 * Devuelve la caja y el color de cada elemento de la capa determinista, más la
 * de cada zona de marca (`data-panel`): placa, velo, sello o cartel. Con eso,
 * afuera se comprueban las dos cosas que no se pueden afirmar leyendo el
 * código: que nada se sale de su zona y que el contraste medido sobre los
 * píxeles exportados cumple el umbral.
 *
 * Se mantiene como texto porque corre en el contexto de la página, no en el del
 * worker. Es el mismo criterio que `tools/design-review/geometry.ts`.
 */

export interface MeasuredNode {
  /** Color de texto resuelto, tal como lo pinta el navegador. */
  readonly color: string;
  /**
   * Caja de contenido: la caja menos relleno y borde, que es donde están las
   * letras. Es la que se usa para medir el fondo debajo del texto, porque la
   * caja completa de un botón redondeado incluye esquinas que no tocan ninguna
   * letra.
   */
  readonly contentHeight: number;
  readonly contentWidth: number;
  readonly contentX: number;
  readonly contentY: number;
  readonly height: number;
  readonly role: string;
  /** Texto visible; vacío en el panel y en el logo, que es un dibujo. */
  readonly text: string;
  readonly width: number;
  /** Coordenadas relativas a la pieza, no a la ventana. */
  readonly x: number;
  readonly y: number;
}

export const measuredNodesScript = `
  (() => {
    const card = document.querySelector("[data-card]");
    if (!card) {
      return [];
    }

    const cardBox = card.getBoundingClientRect();
    const nodes = [];

    const push = (node, role) => {
      const box = node.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        return;
      }
      const style = getComputedStyle(node);
      const insetLeft =
        parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
      const insetRight =
        parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
      const insetTop =
        parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
      const insetBottom =
        parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
      nodes.push({
        color: style.color,
        contentHeight: Math.max(1, box.height - insetTop - insetBottom),
        contentWidth: Math.max(1, box.width - insetLeft - insetRight),
        contentX: box.left - cardBox.left + insetLeft,
        contentY: box.top - cardBox.top + insetTop,
        height: box.height,
        role,
        text: (node.textContent ?? "").trim(),
        width: box.width,
        x: box.left - cardBox.left,
        y: box.top - cardBox.top,
      });
    };

    for (const panel of card.querySelectorAll("[data-panel]")) {
      push(panel, "panel");
    }

    for (const node of card.querySelectorAll("h1")) {
      push(node, "titulo");
    }
    for (const node of card.querySelectorAll("[data-price]")) {
      push(node, "precio");
    }
    for (const node of card.querySelectorAll("[data-cta]")) {
      push(node, "cta");
    }
    for (const node of card.querySelectorAll("[data-logo]")) {
      push(node, "logo");
    }
    for (const node of card.querySelectorAll("[data-panel] p")) {
      push(node, "bajada");
    }
    for (const node of card.querySelectorAll('[data-role="localidad"]')) {
      push(node, "localidad");
    }
    for (const node of card.querySelectorAll('[data-role="etiqueta"]')) {
      push(node, "etiqueta");
    }
    for (const node of card.querySelectorAll('[data-role="aclaracion"]')) {
      push(node, "aclaracion");
    }

    return nodes;
  })()
`;
