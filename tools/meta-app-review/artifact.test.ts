import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetaAppReviewArtifactHtml,
  metaAppReviewArtifact,
} from "./artifact.ts";
import { metaAppReviewIds, metaAppReviewPackage } from "./manifest.ts";

test("la muestra declara un alcance técnico sin afirmaciones comerciales", () => {
  assert.equal(metaAppReviewArtifact.width, 1080);
  assert.equal(metaAppReviewArtifact.height, 1350);
  assert.deepEqual(metaAppReviewArtifact.targets, [
    "instagram_feed",
    "facebook_page",
  ]);
  assert.equal(
    metaAppReviewArtifact.copy,
    "Publicación de prueba para la revisión técnica de Aramayo Content Platform. Sin oferta comercial.",
  );
  assert.doesNotMatch(
    metaAppReviewArtifact.copy,
    /precio|stock|promoción|descuento|urgencia/iu,
  );
});

test("el documento es autocontenido y conserva logo, rótulo y límites", () => {
  const html = buildMetaAppReviewArtifactHtml();
  assert.match(html, /data-meta-app-review-artifact/u);
  assert.match(html, /data-logo/u);
  assert.match(html, /Prueba técnica/u);
  assert.match(html, /Sin oferta comercial/u);
  assert.match(html, /Instagram feed/u);
  assert.match(html, /Facebook Page/u);
  assert.match(html, /Una publicación/u);
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
    "91a4fd42bd7ecfd60f10f1862e8081124993683de34883a46a7bea547cbc74f0",
  );
  assert.equal(
    new URL(metaAppReviewPackage.publicAssetUrl).origin,
    "https://staging.content.ferreteriaaramayo.com.ar",
  );
  assert.equal(new Set(Object.values(metaAppReviewIds)).size, 8);
  assert.equal(
    (
      metaAppReviewPackage.requiredMetaPermissions as readonly string[]
    ).includes("public_profile"),
    false,
  );
});
