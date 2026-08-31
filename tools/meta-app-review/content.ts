import {
  DESIGN_SCHEMA_VERSION,
  parseDesignDocument,
  type AssetReference,
  type DesignDocument,
} from "@aramayo/design-engine";
import type { SafeJsonObject } from "@aramayo/domain";

import { metaAppReviewPackage } from "./manifest.ts";

/**
 * Entrada comercial única para la pieza de App Review.
 *
 * La base es una representación genérica generada para esta candidata y queda
 * identificada como ilustrativa. Marca, amperaje y disponibilidad se fijan
 * desde el snapshot comercial de Odoo documentado en el manifiesto. El precio
 * no se muestra por decisión del negocio del 2026-08-31. Los
 * identificadores internos del producto no se muestran en la publicación.
 */
export function metaAppReviewDesignInput(
  mediaReference: AssetReference,
): SafeJsonObject {
  return Object.freeze({
    content: Object.freeze({
      badge: "Imagen ilustrativa",
      callToAction: "Escribinos",
      category: "Soldadoras",
      title: "LA-SER INVERTER 160 A",
      validity: "Disponible en nuestros negocios: Casa Central y Rivadavia",
    }),
    format: "feed",
    layout: "producto-editorial",
    media: Object.freeze([
      Object.freeze({
        alt: metaAppReviewPackage.altText,
        fit: "contain",
        focus: Object.freeze({ x: 50, y: 50 }),
        reference: mediaReference,
        zoom: 1,
      }),
    ]),
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "la-ser-inverter-160a-app-review",
    theme: "taller",
  });
}

export function metaAppReviewDesignDocument(
  mediaReference: AssetReference,
): DesignDocument {
  const parsed = parseDesignDocument(metaAppReviewDesignInput(mediaReference));
  if (!parsed.ok) {
    throw new Error(
      `La pieza comercial de App Review es inválida: ${parsed.issues
        .map((entry) => `${entry.path}:${entry.code}`)
        .join(", ")}.`,
    );
  }
  return parsed.document;
}

/** Documento exacto que el provisionador conserva en la revisión aprobada. */
export function metaAppReviewPublicationDesignInput(): SafeJsonObject {
  return metaAppReviewDesignInput({
    source: "remote",
    url: metaAppReviewPackage.illustrativeBase.publicAssetUrl,
  });
}
