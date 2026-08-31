import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetaAppReviewArtifactHtml,
  metaAppReviewArtifact,
} from "./artifact.ts";
import { metaAppReviewIds, metaAppReviewPackage } from "./manifest.ts";

test("la candidata explica la utilidad del producto y ofrece consultar el precio", () => {
  assert.equal(metaAppReviewArtifact.width, 1080);
  assert.equal(metaAppReviewArtifact.height, 1350);
  assert.deepEqual(metaAppReviewArtifact.targets, [
    "instagram_feed",
    "facebook_page",
  ]);
  assert.equal(
    metaAppReviewArtifact.copy,
    [
      "Soldadora inverter LA-SER 160 A: para unir piezas de metal y dar forma a tus proyectos de herrería. 🔧",
      "Compacta y liviana, para llevarla donde necesitás trabajar.",
      "Disponible en nuestros negocios: Casa Central (República de Siria 365) y sucursal Rivadavia (Rivadavia 673), Frías.",
      "📲 Consultanos el precio por WhatsApp al 3854 403534.",
    ].join("\n\n"),
  );
  assert.equal(
    metaAppReviewArtifact.approvalStatus,
    "approved-for-single-app-review-order",
  );
  assert.doesNotMatch(
    metaAppReviewArtifact.copy,
    /promoción|descuento|oferta|urgencia|mejor opción|al momento de la verificación|imagen ilustrativa|\$|239\.399/iu,
  );
  assert.equal(
    metaAppReviewArtifact.commercialSnapshot.externalProductId,
    "odoo-product-3941",
  );
  assert.equal(
    metaAppReviewArtifact.commercialSnapshot.price.amountMinor,
    23_939_991,
  );
  assert.equal(
    metaAppReviewArtifact.commercialSnapshot.supplierPriceReference.amountMinor,
    23_328_800,
  );
  assert.deepEqual(
    metaAppReviewArtifact.commercialSnapshot.stock.map((entry) => ({
      locationId: entry.locationId,
      quantity: entry.quantity,
    })),
    [
      { locationId: "casa-central", quantity: 6 },
      { locationId: "rivadavia", quantity: 6 },
    ],
  );
});

test("el documento usa el motor, una base ilustrativa y el CTA aprobado", () => {
  const html = buildMetaAppReviewArtifactHtml();
  const visibleHtml = html.replace(
    /src="data:image\/png;base64,[^"]+"/gu,
    'src="data:image/png;base64,[redacted]"',
  );
  assert.match(html, /data-meta-app-review-artifact/u);
  assert.match(html, /data-logo/u);
  assert.match(html, /LA-SER INVERTER 160 A/u);
  assert.doesNotMatch(visibleHtml, /DISC 225|7039|SKU/iu);
  assert.doesNotMatch(visibleHtml, /\$|239\.399|Precio minorista/iu);
  assert.match(html, /Consultar precio/u);
  assert.match(
    html,
    /Disponible en nuestros negocios: Casa Central y Rivadavia/u,
  );
  assert.match(html, /data-price/u);
  assert.match(html, /Imagen ilustrativa/u);
  assert.match(html, /Escribinos/u);
  assert.doesNotMatch(html, /Consultanos por WhatsApp/u);
  assert.match(html, /data-product-editorial/u);
  assert.match(html, /data-editorial-blur-frame/u);
  assert.match(html, /object-fit:contain/u);
  assert.match(html, /data:image\/png;base64,/u);
  assert.doesNotMatch(html, /stock-herramientas-electricas\.jpg/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});

test("el manifiesto fija acceso mínimo, bytes, URL y una única identidad de muestra", () => {
  assert.deepEqual(metaAppReviewPackage.reviewer.roles, [
    "admin",
    "publisher",
    "viewer",
  ]);
  assert.equal(metaAppReviewPackage.maxAccessDays, 30);
  assert.equal(
    metaAppReviewPackage.sha256,
    "407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43",
  );
  assert.equal(
    metaAppReviewPackage.appIcon.source,
    "@aramayo/design-engine/react#AramayoMark",
  );
  assert.equal(
    metaAppReviewPackage.illustrativeBase.sha256,
    "731ab4ec33f85019d126d949f8999febb22e1a7d88dff45b7367e84db908a4b8",
  );
  assert.equal(metaAppReviewPackage.illustrativeBase.width, 1536);
  assert.equal(metaAppReviewPackage.illustrativeBase.height, 1024);
  assert.equal(
    new URL(metaAppReviewPackage.publicAssetUrl).origin,
    "https://staging.content.ferreteriaaramayo.com.ar",
  );
  assert.equal(new Set(Object.values(metaAppReviewIds)).size, 10);
  assert.equal(
    (
      metaAppReviewPackage.requiredMetaPermissions as readonly string[]
    ).includes("public_profile"),
    false,
  );
});
