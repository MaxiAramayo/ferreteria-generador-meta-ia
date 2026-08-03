/**
 * Política de activos para generación de imágenes.
 *
 * Una referencia que viaja al proveedor sale del sistema: deja de estar bajo
 * nuestro control y puede aparecer transformada en la salida. Por eso la lista
 * de lo admitido es explícita y corta, y todo lo demás se rechaza por defecto.
 *
 * La regla que ordena el resto: la identidad no se genera, se compone. El logo,
 * el nombre, el precio y el llamado a la acción son activos aprobados que el
 * motor determinista dibuja encima. Mandar el logo como referencia sería pedirle
 * al modelo que lo reinterprete, y una marca reinterpretada ya no es la marca.
 */

import { BRAND_ASSETS, type BrandAsset } from "@aramayo/design-engine";
import {
  VisualPromptValidationError,
  type VisualPromptReference,
  type VisualReferenceRole,
} from "@aramayo/domain";

/**
 * Activos de identidad. Se componen; nunca se generan ni se envían como
 * referencia. El prefijo es el criterio porque es el que usa la biblioteca
 * congelada en `P1-T01` para agrupar los logotipos.
 */
const identityAssetPrefix = "brand/logo-";

/**
 * Extensiones admitidas como referencia fotográfica. Un SVG es un dibujo
 * vectorial de nuestro sistema de íconos: no describe cómo se ve un producto
 * real y no sirve como referencia de imagen.
 */
const photographicExtensions: readonly string[] = Object.freeze([
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

export type VisualAssetRejectionCode =
  | "asset-not-approved"
  | "identity-asset"
  | "not-photographic"
  | "role-mismatch";

export interface VisualAssetDecision {
  readonly assetId: string;
  readonly reason: string;
  readonly rejectionCode: VisualAssetRejectionCode;
}

const assetsById: ReadonlyMap<string, BrandAsset> = new Map(
  BRAND_ASSETS.map((asset) => [asset.assetId, asset]),
);

function isPhotographic(asset: BrandAsset): boolean {
  const file = asset.file.toLowerCase();
  return photographicExtensions.some((extension) => file.endsWith(extension));
}

/**
 * Prefijo de las fotos de la gata del local.
 *
 * Es un sujeto real y recurrente, así que necesita sus propias fotos: sin ellas
 * el modelo inventa un gato distinto en cada pieza y quien la conoce lo nota.
 * Todavía no hay ninguna en la biblioteca; el prefijo queda definido para que
 * incorporarlas no requiera tocar la política.
 */
const mascotAssetPrefix = "brand/gata-";

/**
 * Rol que el activo puede cumplir, o `null` si no puede cumplir ninguno.
 *
 * Los activos `media` son fotos de producto propias; los `brand` que no son
 * logotipo ni mascota son fotos del local y del taller, que sirven de contexto
 * pero nunca de producto.
 */
function roleFor(asset: BrandAsset): VisualReferenceRole | null {
  if (asset.assetId.startsWith(identityAssetPrefix)) {
    return null;
  }
  if (asset.assetId.startsWith(mascotAssetPrefix)) {
    return "mascot_photo";
  }
  switch (asset.kind) {
    case "brand":
      return "store_context";
    case "media":
      return "product_photo";
  }
}

/**
 * Evalúa una referencia contra la biblioteca aprobada.
 *
 * Devuelve la referencia resuelta con su hash, o el motivo del rechazo. El hash
 * viaja con la referencia para que la ejecución registre exactamente qué bytes
 * se enviaron, no sólo qué identificador se eligió.
 */
export function decideVisualReference(
  assetId: string,
  role: VisualReferenceRole,
): VisualPromptReference | VisualAssetDecision {
  const asset = assetsById.get(assetId);
  if (asset === undefined) {
    return Object.freeze({
      assetId,
      reason:
        "El activo no pertenece a la biblioteca aprobada; sólo se puede referenciar material con propiedad confirmada por el negocio.",
      rejectionCode: "asset-not-approved" as const,
    });
  }
  if (asset.assetId.startsWith(identityAssetPrefix)) {
    return Object.freeze({
      assetId,
      reason:
        "El logotipo se compone con el motor determinista y nunca se envía como referencia de generación.",
      rejectionCode: "identity-asset" as const,
    });
  }
  if (!isPhotographic(asset)) {
    return Object.freeze({
      assetId,
      reason:
        "Sólo una fotografía sirve de referencia; un ícono vectorial no describe un producto real.",
      rejectionCode: "not-photographic" as const,
    });
  }
  const allowedRole = roleFor(asset);
  if (allowedRole !== role) {
    return Object.freeze({
      assetId,
      reason: `El activo sólo puede referenciarse como ${allowedRole ?? "ninguno"}.`,
      rejectionCode: "role-mismatch" as const,
    });
  }
  return Object.freeze({
    assetId: asset.assetId,
    role,
    sha256: asset.sha256,
  });
}

export function isVisualAssetRejection(
  decision: VisualPromptReference | VisualAssetDecision,
): decision is VisualAssetDecision {
  return "rejectionCode" in decision;
}

export interface VisualReferenceRequest {
  readonly assetId: string;
  readonly role: VisualReferenceRole;
}

/**
 * Resuelve las referencias pedidas o falla con el motivo exacto.
 *
 * Un activo prohibido detiene la construcción en lugar de descartarse en
 * silencio: quien lo eligió tiene que enterarse de por qué no se usó, y una
 * pieza que se generó ignorando la referencia elegida no es la pieza que se
 * pidió.
 */
export function resolveVisualReferences(
  requests: readonly VisualReferenceRequest[],
): readonly VisualPromptReference[] {
  return Object.freeze(
    requests.map((request, index) => {
      const decision = decideVisualReference(request.assetId, request.role);
      if (isVisualAssetRejection(decision)) {
        throw new VisualPromptValidationError(
          "reference-not-approved",
          `references[${String(index)}]`,
          decision.reason,
        );
      }
      return decision;
    }),
  );
}
