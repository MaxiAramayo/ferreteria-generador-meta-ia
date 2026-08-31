import { createHash } from "node:crypto";

import type { SafeJsonObject, SafeJsonValue } from "@aramayo/domain";

/** Todos los campos del paquete forman parte del alcance salvo su aprobación. */
export interface MetaAppReviewApprovalPackage extends SafeJsonObject {
  readonly approvalStatus:
    "approved-for-single-app-review-order" | "pending-business-approval";
  readonly sha256: string | null;
  readonly publicationApproval: SafeJsonObject & {
    readonly approvedAt: string | null;
    readonly packageSha256: string | null;
  };
}

export interface VerifiedMetaAppReviewApproval {
  readonly approvedAt: string;
  readonly bitmapSha256: string;
  readonly packageSha256: string;
}

function canonicalJson(content: SafeJsonValue): string {
  if (Array.isArray(content)) {
    return `[${content.map(canonicalJson).join(",")}]`;
  }
  if (content !== null && typeof content === "object") {
    return `{${Object.entries(content)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(content);
}

export function hashAppReviewContent(content: SafeJsonObject): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

function withoutApprovalFields(
  content: SafeJsonObject,
  excludedFields: readonly string[],
): SafeJsonObject {
  return Object.fromEntries(
    Object.entries(content).filter(([key]) => !excludedFields.includes(key)),
  );
}

/**
 * La candidata y el paquete aprobado comparten esta huella. Calcularla sólo
 * prepara evidencia; nunca concede aprobación ni reemplaza la consulta comercial.
 */
export function metaAppReviewApprovalHash(
  reviewPackage: MetaAppReviewApprovalPackage,
  bitmapSha256: string,
  designDocument: SafeJsonObject,
): string {
  if (!/^[a-f0-9]{64}$/u.test(bitmapSha256)) {
    throw new Error("El checksum del bitmap de App Review no es válido.");
  }
  return hashAppReviewContent({
    bitmapSha256,
    designDocument,
    package: {
      ...withoutApprovalFields(reviewPackage, [
        "approvalStatus",
        "sha256",
        "publicationApproval",
      ]),
      publicationApproval: withoutApprovalFields(
        reviewPackage.publicationApproval,
        ["approvedAt", "packageSha256"],
      ),
    },
    schemaVersion: "meta-app-review-approval/v1",
  });
}

export function requireMetaAppReviewApproval(
  reviewPackage: MetaAppReviewApprovalPackage,
  designDocument: SafeJsonObject,
): VerifiedMetaAppReviewApproval {
  const { approvedAt, packageSha256 } = reviewPackage.publicationApproval;
  const bitmapSha256 = reviewPackage.sha256;
  if (
    reviewPackage.approvalStatus !== "approved-for-single-app-review-order" ||
    approvedAt === null ||
    packageSha256 === null ||
    bitmapSha256 === null
  ) {
    throw new Error(
      "La candidata no tiene aprobación humana del paquete exacto; use --candidate para preparar evidencia local.",
    );
  }

  const approvalDate = new Date(approvedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(approvedAt) ||
    !Number.isFinite(approvalDate.getTime()) ||
    approvalDate.toISOString().slice(0, 10) !== approvedAt
  ) {
    throw new Error("La fecha de aprobación de App Review no es válida.");
  }
  if (!/^[a-f0-9]{64}$/u.test(packageSha256)) {
    throw new Error(
      "Falta una huella válida del paquete aprobado de App Review.",
    );
  }
  if (
    packageSha256 !==
    metaAppReviewApprovalHash(reviewPackage, bitmapSha256, designDocument)
  ) {
    throw new Error(
      "El paquete de App Review cambió después de aprobarse; requiere una nueva aprobación humana.",
    );
  }
  return Object.freeze({ approvedAt, bitmapSha256, packageSha256 });
}
