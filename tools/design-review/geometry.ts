/**
 * Comprobaciones de geometría dentro de la página.
 *
 * Se ejecutan en el navegador sobre la pieza ya compuesta: miden dónde quedó
 * cada elemento crítico y detectan recortes. Un desborde deja de ser algo que
 * hay que ver a ojo y pasa a ser un dato.
 */

export interface GeometryFinding {
  readonly element: string;
  readonly reason: "clipped" | "outside-safe-area" | "overflows-card";
}

export interface GeometryReport {
  readonly cardHeight: number;
  readonly cardWidth: number;
  readonly findings: readonly GeometryFinding[];
}

/**
 * Script que evalúa la página. Se mantiene como texto porque corre en el
 * contexto del navegador, no en el del worker.
 */
export const geometryScript = `
  (() => {
    const card = document.querySelector("[data-card]");
    if (!card) {
      return { cardHeight: 0, cardWidth: 0, findings: [{ element: "card", reason: "clipped" }] };
    }

    const cardBox = card.getBoundingClientRect();
    const safe = JSON.parse(card.dataset.safeArea ?? "null");
    const findings = [];
    const tolerance = 1;

    const critical = [
      ...card.querySelectorAll("h1, [data-cta], [data-price], [data-logo]"),
    ];

    for (const node of critical) {
      const box = node.getBoundingClientRect();
      const name = node.tagName === "H1" ? "titulo" : (node.dataset.role ?? node.tagName.toLowerCase());

      const styles = getComputedStyle(node);
      const visuallyHidden =
        styles.clipPath === "inset(50%)" || (box.width <= 1 && box.height <= 1);

      if (visuallyHidden) {
        // Texto sólo para lectores de pantalla: no ocupa lugar en la pieza.
        continue;
      }

      if (box.width === 0 || box.height === 0) {
        findings.push({ element: name, reason: "clipped" });
        continue;
      }

      if (
        box.left < cardBox.left - tolerance ||
        box.top < cardBox.top - tolerance ||
        box.right > cardBox.right + tolerance ||
        box.bottom > cardBox.bottom + tolerance
      ) {
        findings.push({ element: name, reason: "overflows-card" });
        continue;
      }

      if (safe) {
        const insideSafe =
          box.left >= cardBox.left + safe.left - tolerance &&
          box.top >= cardBox.top + safe.top - tolerance &&
          box.right <= cardBox.right - safe.right + tolerance &&
          box.bottom <= cardBox.bottom - safe.bottom + tolerance;

        if (!insideSafe) {
          findings.push({ element: name, reason: "outside-safe-area" });
        }
      }
    }

    return {
      cardHeight: Math.round(cardBox.height),
      cardWidth: Math.round(cardBox.width),
      findings,
    };
  })()
`;

/**
 * Reglas de accesibilidad del harness del panel.
 *
 * No reemplaza una auditoría completa: cubre lo que rompe el uso real —falta de
 * nombre accesible, encabezados desordenados, imágenes sin alternativa y foco
 * invisible— y falla con la lista concreta.
 */
export const accessibilityScript = `
  (() => {
    const findings = [];

    // Lo que está dentro de un role="img" o aria-hidden no se expone al árbol
    // de accesibilidad: una vista previa se anuncia como una imagen con nombre,
    // no como la estructura de la pieza que contiene.
    const exposed = (node) =>
      node.closest('[role="img"], [aria-hidden="true"]') === null;

    const headings = [...document.querySelectorAll("h1, h2, h3, h4")].filter(exposed);
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));

    if (levels.filter((level) => level === 1).length !== 1) {
      findings.push({ detail: "La página debe tener exactamente un h1.", rule: "encabezados" });
    }

    for (let index = 1; index < levels.length; index += 1) {
      if (levels[index] - levels[index - 1] > 1) {
        findings.push({
          detail: "Los encabezados saltan un nivel: " + headings[index].textContent?.trim(),
          rule: "encabezados",
        });
      }
    }

    for (const image of [...document.querySelectorAll("img")].filter(exposed)) {
      if (image.getAttribute("alt") === null) {
        findings.push({ detail: "Imagen sin texto alternativo: " + image.src, rule: "alternativas" });
      }
    }

    for (const control of [...document.querySelectorAll("a, button, [role=button]")].filter(exposed)) {
      const name = (control.textContent ?? "").trim() || control.getAttribute("aria-label");
      if (!name) {
        findings.push({ detail: "Control sin nombre accesible.", rule: "nombre-accesible" });
      }
    }

    for (const section of document.querySelectorAll("section")) {
      const labelled = section.getAttribute("aria-labelledby") ?? section.getAttribute("aria-label");
      if (!labelled) {
        findings.push({ detail: "Sección sin nombre accesible.", rule: "regiones" });
      }
    }

    const focusable = [...document.querySelectorAll("a[href], button, input, select, textarea")];

    return { findings, focusableCount: focusable.length };
  })()
`;
