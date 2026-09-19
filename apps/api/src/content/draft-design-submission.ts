import { BadRequestException } from "@nestjs/common";

import type {
  DraftMediaInputDto,
  PublicationDraftDesignDto,
} from "./dto/publication-draft.dto.ts";
import type { DraftDesignSubmission } from "./publication-draft.service.ts";

/**
 * Un medio tiene exactamente un origen: un activo guardado de la organización,
 * una foto de la biblioteca de marca o una foto embebida.
 */
function mediaSource(
  media: DraftMediaInputDto,
): Readonly<
  { brandAssetId: string } | { dataUrl: string } | { mediaAssetId: string }
> {
  const { brandAssetId, dataUrl, mediaAssetId } = media;
  const declared = [brandAssetId, dataUrl, mediaAssetId].filter(
    (source) => source !== undefined,
  );
  if (declared.length === 1) {
    if (mediaAssetId !== undefined) return { mediaAssetId };
    if (dataUrl !== undefined) return { dataUrl };
    if (brandAssetId !== undefined) return { brandAssetId };
  }
  throw new BadRequestException({
    field: "design.media",
    message:
      "Cada medio es un activo guardado, una foto de la marca o una foto embebida.",
  });
}

/** Traduce el diseño validado por transporte a la entrada del caso de uso. */
export function draftDesignSubmission(
  design: PublicationDraftDesignDto,
): DraftDesignSubmission {
  return {
    content: design.content,
    format: design.format,
    layout: design.layout,
    media: design.media.map((media) => ({
      alt: media.alt,
      ...(media.fit === undefined ? {} : { fit: media.fit }),
      ...(media.focus === undefined
        ? {}
        : { focus: { x: media.focus.x, y: media.focus.y } }),
      ...mediaSource(media),
      ...(media.zoom === undefined ? {} : { zoom: media.zoom }),
    })),
    schemaVersion: design.schemaVersion,
    slug: design.slug,
    theme: design.theme,
  };
}
