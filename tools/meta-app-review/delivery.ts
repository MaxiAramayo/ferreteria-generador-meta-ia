import { readFile } from "node:fs/promises";

import { metaAppReviewIds, metaAppReviewPackage } from "./manifest.ts";

export interface MetaAppReviewDelivery {
  readonly organizationId: string;
  readonly secureUrl: string;
  readonly storageKey: string;
  readonly storageVersion: number;
}

/** Sólo admite el original exacto dentro del espacio staging autorizado. */
export async function readMetaAppReviewDelivery(
  path: string,
): Promise<MetaAppReviewDelivery> {
  const receipt: unknown = JSON.parse(await readFile(path, "utf8"));
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    Array.isArray(receipt)
  ) {
    throw new Error("El comprobante de Cloudinary no es válido.");
  }
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(receipt),
  );
  const { organizationId, secureUrl, storageKey, storageVersion } = fields;
  if (
    typeof organizationId !== "string" ||
    !/^[a-f0-9-]{36}$/u.test(organizationId) ||
    typeof storageVersion !== "number" ||
    !Number.isSafeInteger(storageVersion) ||
    storageVersion < 1 ||
    storageKey !==
      `aramayo-posts/staging/${organizationId}/${metaAppReviewIds.mediaAssetId}` ||
    secureUrl !==
      `https://res.cloudinary.com/m73l9k4c/image/upload/v${String(storageVersion)}/${storageKey}.png` ||
    fields["checksumSha256"] !== metaAppReviewPackage.sha256 ||
    fields["width"] !== metaAppReviewPackage.width ||
    fields["height"] !== metaAppReviewPackage.height ||
    fields["mimeType"] !== "image/png"
  ) {
    throw new Error(
      "Cloudinary no identifica el original aprobado en el espacio staging autorizado.",
    );
  }
  return Object.freeze({
    organizationId,
    secureUrl,
    storageKey,
    storageVersion,
  });
}
