/**
 * Casos de la suite de composición.
 *
 * Cubren lo que la tarea exige demostrar: las tres piezas en los tres formatos
 * aprobados, sobre los cuatro fondos que rompen una composición —claro, oscuro,
 * recargado y con el producto fuera de centro— más el camino determinista, que
 * sale sin imagen del modelo.
 *
 * Los fondos se fabrican acá y no se descargan: la suite tiene que dar el mismo
 * resultado en cualquier máquina y sin red, y para eso los píxeles se generan
 * con una fórmula en lugar de venir de un archivo o de un proveedor.
 */

import { createHash } from "node:crypto";

import type { FormatId } from "@aramayo/design-engine";
import {
  composedLayoutFor,
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

const regions: readonly VisualReservedSpace[] = [
  "lower_third",
  "upper_band",
  "center_circle",
];

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
}

/**
 * El recorrido completo.
 *
 * Cada pieza en cada formato contra cada fondo, más una corrida determinista
 * por pieza. El caso determinista no lleva fondo: es la pieza que sale cuando
 * el brief pidió plantilla, la generación está apagada o no hay foto aprobada.
 */
export function compositionCases(): readonly CompositionCase[] {
  const cases: CompositionCase[] = [];

  for (const region of regions) {
    const layout = composedLayoutFor(region);

    if (layout === null) {
      continue;
    }

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

    cases.push({
      background: null,
      format: "feed",
      id: `${layout}-feed-determinista`,
      layout,
      region,
    });
  }

  return cases;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
