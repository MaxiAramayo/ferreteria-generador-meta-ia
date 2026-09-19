import type { RecurringStoryPhotoPayload } from "@aramayo/contracts";
import { recurringStoryPhotoLimits } from "@aramayo/domain";

/**
 * Foto propia de una historia de apertura, preparada en el navegador.
 *
 * El archivo nunca viaja tal cual: se decodifica, se achica a lo que la
 * historia puede mostrar y se vuelve a codificar como JPEG. Eso quita los
 * metadatos —también la ubicación GPS de una foto de celular— y deja un peso
 * que entra en cada borrador (`ADR-030`).
 */

export const openingPhotoBounds = Object.freeze({ height: 1920, width: 1080 });

/** Un archivo más pesado que esto no se intenta abrir. */
const sourceBytesMaximum = 25 * 1024 * 1024;
const qualities = Object.freeze([0.86, 0.74, 0.62]);

export const defaultOpeningPhotoAlt = "Foto propia de la apertura";

export type OpeningPhotoResult =
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; photo: RecurringStoryPhotoPayload }>;

/** Tamaño que conserva la proporción y entra en el máximo, sin agrandar. */
export function fitWithin(
  width: number,
  height: number,
  bounds: Readonly<{ height: number; width: number }> = openingPhotoBounds,
): Readonly<{ height: number; width: number }> {
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

/** Primera codificación que entra en el límite, de mejor a peor calidad. */
export function firstThatFits(
  encode: (quality: number) => string,
  maximum: number = recurringStoryPhotoLimits.dataUrlMaximum,
): string | null {
  for (const quality of qualities) {
    const dataUrl = encode(quality);
    if (dataUrl.length <= maximum) return dataUrl;
  }
  return null;
}

export async function prepareOpeningPhoto(
  file: File,
): Promise<OpeningPhotoResult> {
  if (!file.type.startsWith("image/")) {
    return { kind: "error", message: "Elegí una imagen: JPEG, PNG o WebP." };
  }
  if (file.size > sourceBytesMaximum) {
    return {
      kind: "error",
      message: "La imagen pesa más de 25 MB. Probá con una foto más liviana.",
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Chrome no abre HEIC: la foto del iPhone tiene que exportarse como JPEG.
    return {
      kind: "error",
      message:
        "No se pudo abrir esa imagen. Si es HEIC del iPhone, exportala como JPEG.",
    };
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (context === null) {
      return {
        kind: "error",
        message: "El navegador no pudo preparar la foto.",
      };
    }
    // Un PNG con transparencia no puede quedar negro al pasar a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    const dataUrl = firstThatFits((quality) =>
      canvas.toDataURL("image/jpeg", quality),
    );
    return dataUrl === null
      ? {
          kind: "error",
          message: "La foto sigue siendo muy pesada. Probá recortarla antes.",
        }
      : {
          kind: "ready",
          photo: { alt: defaultOpeningPhotoAlt, dataUrl, focusY: 50 },
        };
  } finally {
    bitmap.close();
  }
}
