/**
 * Autoridad única del paquete temporal de Meta App Review.
 *
 * La pieza técnica del 2026-08-21 fue revocada por el negocio el 2026-08-22.
 * El negocio aprobó la pieza comercial y ordenó publicarla el 2026-08-31.
 * Los bytes, copy, destinos y límites quedan ligados a la huella presentada.
 */

type MetaAppReviewApprovalStatus =
  "approved-for-single-app-review-order" | "pending-business-approval";

function approvalStatus(): MetaAppReviewApprovalStatus {
  return "approved-for-single-app-review-order";
}

function approvedText(text: string): string | null {
  return text;
}

export const metaAppReviewPackage = Object.freeze({
  administrativeApprovalAt: "2026-08-21",
  approvalStatus: approvalStatus(),
  altText:
    "Imagen ilustrativa de una soldadora roja y negra, careta y guantes sobre un banco de taller. La pieza presenta la soldadora LA-SER Inverter 160 A e invita a consultar el precio. Disponible en Casa Central y Rivadavia, Frías.",
  appIcon: Object.freeze({
    approvedSourceAt: "2026-08-31",
    fileName: "aramayo-app-icon.png",
    height: 1024,
    sha256: "7a9d59c2294ac3a7515ca4aae0be61bc5d02bca87f4d468dbcffccb9a5cb31b0",
    source: "@aramayo/design-engine/react#AramayoMark",
    width: 1024,
  }),
  commercialSnapshot: Object.freeze({
    brand: "LA-SER",
    externalProductId: "odoo-product-3941",
    observedAt: "2026-08-24T23:20:16.000Z",
    price: Object.freeze({
      amountMinor: 23_939_991,
      currency: "ARS",
      evidenceReference: "odoo:product.product:3941:price:casa-central",
      requestId: "ee57c502-bcbd-48c8-b666-6659f25b30e3",
    }),
    productEvidenceReference: "odoo:product.product:3941",
    productName: "LA SER SOLDADORA INVERTER 160 AMP DISC 225",
    productRequestId: "898ca1da-8555-4701-805c-2b9064048dda",
    publicationRule: "revalidate-product-and-stock-before-publication",
    stock: Object.freeze([
      Object.freeze({
        evidenceReference: "odoo:product.product:3941:stock:casa-central",
        locationId: "casa-central",
        quantity: 6,
        requestId: "96b1c16d-2d41-4dc3-a62f-41c08889a629",
      }),
      Object.freeze({
        evidenceReference: "odoo:product.product:3941:stock:rivadavia",
        locationId: "rivadavia",
        quantity: 6,
        requestId: "f329e746-98f3-42ed-acc4-e986681ca90d",
      }),
    ]),
    supplierPriceReference: Object.freeze({
      amountMinor: 23_328_800,
      comparisonRule: "reference-only-do-not-overwrite-retail-price",
      currency: "ARS",
      observedAt: "2026-08-24T23:33:49.000Z",
      productUrl: "https://www.la-ser.com.ar/productos/discovery-225-mma/",
      supplierName: "LA-SER",
    }),
  }),
  copy: [
    "Soldadora inverter LA-SER 160 A: para unir piezas de metal y dar forma a tus proyectos de herrería. 🔧",
    "Compacta y liviana, para llevarla donde necesitás trabajar.",
    "Disponible en nuestros negocios: Casa Central (República de Siria 365) y sucursal Rivadavia (Rivadavia 673), Frías.",
    "📲 Consultanos el precio por WhatsApp al 3854 403534.",
  ].join("\n\n"),
  copyEvidence: Object.freeze({
    description:
      "Equipo MMA de 245×180×170 mm y 2,5 kg; corriente de soldadura de 20 a 160 A.",
    productUrl: "https://www.la-ser.com.ar/productos/discovery-225-mma/",
    reviewedAt: "2026-08-31",
  }),
  fileName: "meta-app-review-soldadoras.png",
  height: 1350,
  maxAccessDays: 30,
  maxOrders: 1,
  publicationTitle: "LA-SER Inverter 160 A",
  publicationApproval: Object.freeze({
    ambiguousOutcome: "reconcile-only",
    approvedAt: approvedText("2026-08-31"),
    maximumWindowDays: 30,
    packageSha256: approvedText(
      "7e44022a2020875ba420e99736711b7f8953051d6afb6bb8d462f59a460b012e",
    ),
    removal: "manual-after-meta-decision",
    startsAt: "temporary-credentials-delivered",
    supervision: "business-owner",
  }),
  publicAssetUrl:
    "https://staging.content.ferreteriaaramayo.com.ar/meta-app-review-soldadoras.png",
  illustrativeBase: Object.freeze({
    fileName: "meta-app-review-soldadora-base.png",
    height: 1024,
    publicAssetUrl:
      "https://staging.content.ferreteriaaramayo.com.ar/meta-app-review-soldadora-base.png",
    sha256: "731ab4ec33f85019d126d949f8999febb22e1a7d88dff45b7367e84db908a4b8",
    width: 1536,
  }),
  requiredMetaPermissions: Object.freeze([
    "instagram_basic",
    "instagram_content_publish",
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_show_list",
  ] as const),
  reviewer: Object.freeze({
    email: "meta-app-review@aramayo.invalid",
    roles: Object.freeze(["admin", "publisher", "viewer"] as const),
  }),
  sha256: approvedText(
    "407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43",
  ),
  targets: Object.freeze(["instagram_feed", "facebook_page"] as const),
  version: "meta-app-review/2026-08-31.1-candidate",
  width: 1080,
});

export const metaAppReviewIds = Object.freeze({
  approvalSnapshotId: "5a083000-0000-4000-8000-000000000004",
  auditEventId: "5a083000-0000-4000-8000-000000000008",
  illustrativeMediaAssetId: "5a083000-0000-4000-8000-000000000009",
  mediaAssetId: "5a083000-0000-4000-8000-000000000001",
  publicationId: "5a080000-0000-4000-8000-000000000002",
  revisionId: "5a083000-0000-4000-8000-000000000003",
  revisionMediaId: "5a083000-0000-4000-8000-000000000005",
  transitionEditId: "5a083000-0000-4000-8000-000000000010",
  transitionReadyId: "5a083000-0000-4000-8000-000000000006",
  transitionApprovedId: "5a083000-0000-4000-8000-000000000007",
});
