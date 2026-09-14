/**
 * Casos de la suite de composición.
 *
 * Cubren lo que hay que demostrar de cada pieza —las tres de región de `P4-T05`
 * y los nueve marcos de `ADR-029`— en los tres formatos aprobados, sobre los
 * cuatro fondos que rompen una composición —claro, oscuro, recargado y con el
 * producto fuera de centro—, más el camino determinista, que sale sin imagen del
 * modelo. Cada marco se prueba además con un titular al límite de su
 * presupuesto, que es donde un texto se sale de su zona.
 *
 * Los fondos se fabrican acá y no se descargan: la suite tiene que dar el mismo
 * resultado en cualquier máquina y sin red, y para eso los píxeles se generan
 * con una fórmula en lugar de venir de un archivo o de un proveedor.
 */

import { createHash } from "node:crypto";

import type { FormatId } from "@aramayo/design-engine";
import {
  composedTitleBudget,
  defaultRegionForFrame,
  frameLayoutIds,
  regionLayoutIds,
  regionLayoutRegions,
  type ComposedLayoutId,
  type ContentBrief,
  type VisualReservedSpace,
} from "@aramayo/domain";
import sharp from "sharp";

/** Tamaño que devuelve el proveedor para un feed; el recorte es real. */
const baseWidth = 1024;
const baseHeight = 1536;

export const compositionBackgrounds = [
  "claro",
  "oscuro",
  "recargado",
  "producto-fuera-de-centro",
] as const;

export type CompositionBackground = (typeof compositionBackgrounds)[number];

const formats: readonly FormatId[] = ["feed", "cuadrado", "historia"];

/**
 * Brief representativo: producto con precio sustentado y vigencia.
 *
 * No es un literal suelto: lleva la forma que produce `validateContentBrief`,
 * así que si el contrato del brief cambia, esta suite deja de compilar en lugar
 * de congelar una forma que ya no existe.
 */
export const compositionBrief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Reservalo por WhatsApp",
  }),
  caption:
    "Tenemos la perforadora percutora para tu obra; pasá por el local y consultanos.",
  creativeProposal: "Herramienta sobre banco de taller, luz lateral cálida.",
  missingInformation: Object.freeze([]),
  objective: "promotion",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "C1",
      externalProductId: "odoo-product-101",
      label: "Perforadora percutora 650 W",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: "Con mecha y maletín.",
  title: "Perforadora 650 W",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "price" as const,
      evidenceId: "C1",
      statement: "La perforadora cuesta $ 24.500 en mostrador.",
    }),
    Object.freeze({
      claimKind: "promotion" as const,
      evidenceId: "C2",
      statement: "La promoción rige hasta el sábado.",
    }),
  ]),
  visualDirection: "clean_product",
});

/**
 * Fabrica el fondo.
 *
 * Cada variante ataca un modo de fallo distinto de la composición: el claro
 * hunde el texto oscuro, el oscuro hunde el claro, el recargado destruye la
 * legibilidad con detalle de alta frecuencia, y el descentrado comprueba que el
 * recorte no se coma el sujeto.
 */
export async function backgroundBytes(
  background: CompositionBackground,
): Promise<Uint8Array> {
  const channels = 3;
  const pixels = Buffer.alloc(baseWidth * baseHeight * channels);

  for (let y = 0; y < baseHeight; y += 1) {
    for (let x = 0; x < baseWidth; x += 1) {
      const offset = (y * baseWidth + x) * channels;
      const [red, green, blue] = pixelFor(background, x, y);
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
    }
  }

  const png = await sharp(pixels, {
    raw: { channels, height: baseHeight, width: baseWidth },
  })
    // Compresión explícita: dos corridas tienen que dar los mismos bytes, o el
    // hash de la base cambiaría entre máquinas y la suite dejaría de comparar.
    .png({ compressionLevel: 9, effort: 1 })
    .toBuffer();

  return new Uint8Array(png);
}

function pixelFor(
  background: CompositionBackground,
  x: number,
  y: number,
): readonly [number, number, number] {
  switch (background) {
    case "claro": {
      // Casi blanco, con una caída suave: es el fondo que hunde un texto oscuro
      // si el panel no fuera opaco.
      const value = 236 + Math.round((y / baseHeight) * 12);
      return [value, value, value - 4];
    }
    case "oscuro": {
      const value = 12 + Math.round((y / baseHeight) * 14);
      return [value, value + 2, value + 4];
    }
    case "recargado": {
      // Detalle de alta frecuencia en los dos ejes: el peor caso para apoyar
      // texto directamente sobre la imagen.
      const wave = Math.sin(x / 7) * Math.cos(y / 5);
      const value = 128 + Math.round(wave * 110);
      return [value, 255 - value, (value * 3) % 256];
    }
    case "producto-fuera-de-centro": {
      // Un bulto claro arriba a la izquierda sobre fondo oscuro: si el recorte
      // se quedara en el centro, la pieza perdería el sujeto.
      const distance = Math.hypot(x - baseWidth * 0.3, y - baseHeight * 0.28);
      const inside = distance < baseWidth * 0.22;
      return inside ? [226, 214, 196] : [26, 24, 22];
    }
  }
}

export interface CompositionCase {
  readonly background: CompositionBackground | null;
  readonly format: FormatId;
  readonly id: string;
  readonly layout: ComposedLayoutId;
  readonly region: VisualReservedSpace;
  /**
   * Titular que reemplaza al del brief de la suite. Existe para probar cada
   * marco con el texto más largo que admite.
   */
  readonly title?: string | undefined;
}

const longTitleWords: readonly string[] =
  "Perforadora percutora inalámbrica de 650 W con mecha maletín cargador y batería para obra taller y hogar".split(
    " ",
  );

/**
 * Titular realista al límite del presupuesto de una pieza.
 *
 * Se arma con palabras enteras: una palabra no se parte, así que es la que
 * decide si un titular desborda, y un relleno de letras repetidas probaría otra
 * cosa.
 */
export function longTitleFor(layout: ComposedLayoutId): string {
  const budget = composedTitleBudget[layout];
  let title = "";

  for (const word of longTitleWords) {
    const next = title.length === 0 ? word : `${title} ${word}`;

    if (next.length > budget) {
      break;
    }

    title = next;
  }

  return title;
}

function pushPieceCases(
  cases: CompositionCase[],
  layout: ComposedLayoutId,
  region: VisualReservedSpace,
): void {
  for (const format of formats) {
    for (const background of compositionBackgrounds) {
      cases.push({
        background,
        format,
        id: `${layout}-${format}-${background}`,
        layout,
        region,
      });
    }
  }

  for (const format of formats) {
    cases.push({
      background: null,
      format,
      id: `${layout}-${format}-determinista`,
      layout,
      region,
    });
  }
}

/**
 * El recorrido completo.
 *
 * Cada pieza en cada formato contra cada fondo, más una corrida determinista
 * por pieza y formato. El caso determinista no lleva fondo: es la pieza que
 * sale cuando el brief pidió plantilla, la generación está apagada o no hay
 * foto aprobada, y es también el que cubre en la regresión visual los formatos
 * de las piezas que ningún perfil usa por defecto.
 * Los marcos suman, por formato, el titular más largo que admiten sobre el
 * fondo claro.
 */
export function compositionCases(): readonly CompositionCase[] {
  const cases: CompositionCase[] = [];

  for (const layout of regionLayoutIds) {
    pushPieceCases(cases, layout, regionLayoutRegions[layout]);
  }

  for (const layout of frameLayoutIds) {
    const region = defaultRegionForFrame(layout);
    pushPieceCases(cases, layout, region);

    for (const format of formats) {
      cases.push({
        background: "claro",
        format,
        id: `${layout}-${format}-titulo-largo`,
        layout,
        region,
        title: longTitleFor(layout),
      });
    }
  }

  return cases;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
