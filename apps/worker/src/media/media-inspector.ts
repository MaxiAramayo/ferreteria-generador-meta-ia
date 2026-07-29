import { createHash } from "node:crypto";

import {
  mediaUploadPolicy,
  MediaValidationError,
  type InspectMediaInput,
  type MediaInspection,
  type MediaInspector,
} from "@aramayo/domain";
import sharp from "sharp";

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

export class SharpMediaInspector implements MediaInspector {
  async inspect(input: InspectMediaInput): Promise<MediaInspection> {
    if (input.bytes.byteLength < 1) {
      throw new MediaValidationError("file-empty", "El archivo está vacío.");
    }
    if (input.bytes.byteLength > mediaUploadPolicy.maximumByteSize) {
      throw new MediaValidationError(
        "file-too-large",
        "La imagen supera el límite de 8 MiB.",
      );
    }

    try {
      const image = sharp(input.bytes, {
        failOn: "error",
        limitInputPixels: mediaUploadPolicy.maximumPixels,
      });
      const metadata = await image.metadata();
      await image.stats();

      return Object.freeze({
        byteSize: input.bytes.byteLength,
        checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
        detectedMimeType: detectedMimeType(metadata.format),
        height: metadata.height,
        width: metadata.width,
      });
    } catch (cause: unknown) {
      if (cause instanceof MediaValidationError) {
        throw cause;
      }
      throw new MediaValidationError(
        "dimensions-invalid",
        "La imagen está corrupta o no se puede decodificar.",
      );
    }
  }
}
