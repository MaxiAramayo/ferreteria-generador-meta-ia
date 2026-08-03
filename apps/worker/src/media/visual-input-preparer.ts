/**
 * Preparación de entradas visuales con Sharp.
 *
 * Todo lo que sale del sistema pasa por acá. El derivado se reconstruye desde
 * los píxeles decodificados, así que no arrastra nada del contenedor original:
 * ni EXIF, ni GPS, ni XMP, ni miniaturas incrustadas.
 *
 * Tres decisiones que explican el orden de las operaciones:
 *
 * 1. La orientación se aplica antes de descartar los metadatos. Un JPEG de
 *    teléfono guarda la foto acostada y la endereza con una etiqueta EXIF; si se
 *    borrara la etiqueta sin rotar los píxeles, la foto quedaría de costado.
 * 2. El color se normaliza a sRGB. Un perfil ICC distinto viaja como metadato y
 *    se pierde al limpiar; convertir primero evita que los colores se corran.
 * 3. El derivado no agranda: si la foto es más chica que el lado máximo se usa
 *    tal cual. Interpolar píxeles no agrega información y sí inventa detalle.
 */

import { createHash } from "node:crypto";

import {
  decideVisualInput,
  visualInputLimits,
  type PreparedVisualArtifact,
  type PrepareVisualInputCommand,
  type VisualInputMimeType,
  type VisualInputPreparationResult,
  type VisualInputPreparer,
} from "@aramayo/domain";
import sharp from "sharp";

/** Ancho del marco que se muestrea para estimar cuán cargado está el fondo. */
const borderFraction = 0.12;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function detectedMimeType(format: string | undefined): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case undefined:
      return "application/octet-stream";
    default:
      return `image/${format}`;
  }
}

/**
 * Estima cuán parejo es el borde del cuadro, de 0 a 1.
 *
 * Mira sólo el marco porque es donde vive el fondo: el centro es el producto y
 * su detalle no es ruido. Se usa la desviación estándar de una versión reducida
 * a escala de grises, que es barata y suficiente para avisar.
 */
async function backgroundUniformity(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<number> {
  const borderWidth = Math.max(1, Math.round(width * borderFraction));
  const borderHeight = Math.max(1, Math.round(height * borderFraction));
  const strips = [
    { height: borderHeight, left: 0, top: 0, width },
    { height: borderHeight, left: 0, top: height - borderHeight, width },
    { height, left: 0, top: 0, width: borderWidth },
    { height, left: width - borderWidth, top: 0, width: borderWidth },
  ];

  let total = 0;
  for (const strip of strips) {
    const stats = await sharp(bytes).extract(strip).greyscale().stats();
    const channel = stats.channels[0];
    total += channel === undefined ? 0 : channel.stdev;
  }
  // 64 es la desviación a partir de la cual el borde ya no se lee como fondo.
  const averageDeviation = total / strips.length;
  return Math.max(0, Math.min(1, 1 - averageDeviation / 64));
}

export class SharpVisualInputPreparer implements VisualInputPreparer {
  async prepare(
    command: PrepareVisualInputCommand,
  ): Promise<VisualInputPreparationResult> {
    const sourceSha256 = sha256(command.bytes);

    let width: number;
    let height: number;
    let mimeType: string;
    try {
      const metadata = await sharp(command.bytes, {
        failOn: "error",
        limitInputPixels: 40_000_000,
      }).metadata();
      // La orientación EXIF puede declarar la foto acostada; las medidas que
      // decide la política son las que va a tener el derivado ya enderezado.
      const rotated =
        metadata.orientation !== undefined && metadata.orientation >= 5;
      width = rotated ? metadata.height : metadata.width;
      height = rotated ? metadata.width : metadata.height;
      mimeType = detectedMimeType(metadata.format);
    } catch {
      return Object.freeze({
        rejection: Object.freeze({
          code: "not-decodable" as const,
          correction:
            "El archivo está dañado o no es una imagen. Volvé a exportarla y subila de nuevo.",
          reason: "La imagen no se puede decodificar.",
        }),
        status: "rejected" as const,
      });
    }

    const decision = decideVisualInput(
      {
        inspection: {
          backgroundUniformity: await backgroundUniformity(
            command.bytes,
            width,
            height,
          ),
          byteSize: command.bytes.byteLength,
          height,
          mimeType,
          width,
        },
        ownerOrganizationId: command.ownerOrganizationId,
        role: command.role,
      },
      command.organizationId,
    );
    if (decision.status === "rejected") {
      return Object.freeze({
        rejection: decision.rejection,
        status: "rejected" as const,
      });
    }

    const outputMimeType: VisualInputMimeType =
      mimeType === "image/png" ? "image/png" : "image/jpeg";

    const [original, reference] = await Promise.all([
      this.#encode(command.bytes, outputMimeType, null),
      this.#encode(
        command.bytes,
        outputMimeType,
        visualInputLimits.preparedLongestSide,
      ),
    ]);

    return Object.freeze({
      prepared: Object.freeze({
        original,
        reference,
        role: command.role,
        sourceByteSize: command.bytes.byteLength,
        sourceSha256,
      }),
      status: "prepared" as const,
    });
  }

  /**
   * Reconstruye la imagen desde sus píxeles.
   *
   * El formato de salida sigue al de entrada. Convertir un PNG a JPEG le sacaría
   * la transparencia, y un recorte de producto sobre fondo transparente quedaría
   * con un fondo negro que nadie pidió.
   *
   * `longestSide` en `null` produce el original saneado, a resolución completa.
   */
  async #encode(
    bytes: Uint8Array,
    mimeType: VisualInputMimeType,
    longestSide: number | null,
  ): Promise<PreparedVisualArtifact> {
    let pipeline = sharp(bytes, { failOn: "error" })
      // Aplica la orientación a los píxeles y descarta la etiqueta.
      .rotate()
      .toColourspace("srgb");

    if (longestSide !== null) {
      pipeline = pipeline.resize({
        fit: "inside",
        height: longestSide,
        width: longestSide,
        withoutEnlargement: true,
      });
    }

    // Las opciones del codificador son explícitas para que dos corridas den los
    // mismos bytes; sin eso el hash dejaría de ser comparable.
    const encoded = await (
      mimeType === "image/png"
        ? pipeline.png({ compressionLevel: 9, effort: 10, palette: false })
        : pipeline.jpeg({ mozjpeg: true, quality: 90 })
    ).toBuffer({ resolveWithObject: true });

    return Object.freeze({
      byteSize: encoded.data.byteLength,
      bytes: new Uint8Array(encoded.data),
      height: encoded.info.height,
      mimeType,
      sha256: sha256(encoded.data),
      width: encoded.info.width,
    });
  }
}
