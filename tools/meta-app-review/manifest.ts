/**
 * Autoridad única del paquete temporal de Meta App Review.
 *
 * Estos valores están ligados a la aprobación humana del 2026-08-21. Cambiar
 * copy, bytes, destinos, identidad o URL invalida esa aprobación y obliga a
 * revisar el paquete antes de volver a provisionarlo.
 */

export const metaAppReviewPackage = Object.freeze({
  administrativeApprovalAt: "2026-08-21",
  altText:
    "Placa técnica de Aramayo Content Platform rotulada App Review y sin oferta comercial.",
  appIcon: Object.freeze({
    file: "packages/design-engine/assets/brand/ferreteria-aramayo-logo.png",
    sha256: "af09293441efd23f4f849123666f2d8f9406d1593612a17fdbbedb22ba9216e9",
  }),
  copy: "Publicación de prueba para la revisión técnica de Aramayo Content Platform. Sin oferta comercial.",
  fileName: "meta-app-review-technical.png",
  height: 1350,
  maxAccessDays: 30,
  publicationTitle: "Muestra técnica de App Review",
  publicationApproval: Object.freeze({
    ambiguousOutcome: "reconcile-only",
    approvedAt: "2026-08-21",
    maximumWindowDays: 30,
    removal: "manual-after-meta-decision",
    startsAt: "temporary-credentials-delivered",
    supervision: "business-owner",
  }),
  publicAssetUrl:
    "https://staging.content.ferreteriaaramayo.com.ar/meta-app-review-technical.png",
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
  sha256: "91a4fd42bd7ecfd60f10f1862e8081124993683de34883a46a7bea547cbc74f0",
  targets: Object.freeze(["instagram_feed", "facebook_page"] as const),
  version: "meta-app-review/2026-08-21.1",
  width: 1080,
});

export const metaAppReviewIds = Object.freeze({
  approvalSnapshotId: "5a080000-0000-4000-8000-000000000004",
  auditEventId: "5a080000-0000-4000-8000-000000000008",
  mediaAssetId: "5a080000-0000-4000-8000-000000000001",
  publicationId: "5a080000-0000-4000-8000-000000000002",
  revisionId: "5a080000-0000-4000-8000-000000000003",
  revisionMediaId: "5a080000-0000-4000-8000-000000000005",
  transitionReadyId: "5a080000-0000-4000-8000-000000000006",
  transitionApprovedId: "5a080000-0000-4000-8000-000000000007",
});
