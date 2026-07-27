import type { AssetReference } from "../contracts/document.ts";
import { DesignEngineError } from "../contracts/errors.ts";
import { BRAND_ASSETS, type BrandAsset } from "./asset-library.ts";

/**
 * Resolución de activos a URL.
 *
 * Un identificador que no está en la biblioteca aprobada no produce una pieza
 * incompleta: detiene la composición con un error de etapa `asset`. La
 * referencia que viaja en el error ya está redactada —tipo e identificador—,
 * nunca una ruta local ni una URL firmada.
 */

const assetsById: ReadonlyMap<string, BrandAsset> = new Map(
  BRAND_ASSETS.map((asset) => [asset.assetId, asset]),
);

export function findBrandAsset(assetId: string): BrandAsset | undefined {
  return assetsById.get(assetId);
}

export function describeReference(reference: AssetReference): string {
  return reference.source === "brand-library"
    ? `brand-library:${reference.assetId}`
    : "remote";
}

function assetNotFound(reference: AssetReference): never {
  throw new DesignEngineError(
    {
      assetReference: describeReference(reference),
      reason: "not-found",
      stage: "asset",
    },
    "El activo referenciado no está en la biblioteca aprobada.",
  );
}

export interface AssetResolutionOptions {
  /** Base pública desde la que se sirven los activos migrados del motor. */
  readonly assetBaseUrl: string;
}

export function resolveAssetUrl(
  reference: AssetReference,
  options: AssetResolutionOptions,
): string {
  if (reference.source === "remote") {
    return reference.url;
  }

  const asset = findBrandAsset(reference.assetId);

  if (asset === undefined) {
    assetNotFound(reference);
  }

  const base = options.assetBaseUrl.endsWith("/")
    ? options.assetBaseUrl
    : `${options.assetBaseUrl}/`;

  return `${base}${asset.file
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
