/**
 * Medición de la pieza compuesta dentro del navegador.
 *
 * Devuelve la caja y el color de cada elemento de la capa determinista, más la
 * del panel que los contiene. Con eso, afuera se comprueban las dos cosas que
 * no se pueden afirmar leyendo el código: que nada se sale del panel y que el
 * contraste medido sobre los píxeles exportados cumple el umbral.
 *
 * Se mantiene como texto porque corre en el contexto de la página, no en el del
 * worker. Es el mismo criterio que `tools/design-review/geometry.ts`.
 */

export interface MeasuredNode {
  /** Color de texto resuelto, tal como lo pinta el navegador. */
  readonly color: string;
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
      nodes.push({
        color: getComputedStyle(node).color,
        height: box.height,
        role,
        text: (node.textContent ?? "").trim(),
        width: box.width,
        x: box.left - cardBox.left,
        y: box.top - cardBox.top,
      });
    };

    const panel = card.querySelector("[data-panel]");
    if (panel) {
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

    return nodes;
  })()
`;
