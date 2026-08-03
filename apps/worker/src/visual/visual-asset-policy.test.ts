import assert from "node:assert/strict";
import test from "node:test";

import { BRAND_ASSETS } from "@aramayo/design-engine";
import { VisualPromptValidationError } from "@aramayo/domain";

import {
  decideVisualReference,
  isVisualAssetRejection,
  resolveVisualReferences,
} from "./visual-asset-policy.ts";

test("una foto de producto propia se admite con su hash", () => {
  const decision = decideVisualReference("taladro", "product_photo");
  assert.ok(isVisualAssetRejection(decision));
  assert.equal(decision.rejectionCode, "not-photographic");

  const photo = decideVisualReference(
    "stock-herramientas-electricas",
    "product_photo",
  );
  assert.ok(!isVisualAssetRejection(photo));
  const approved = BRAND_ASSETS.find(
    (asset) => asset.assetId === "stock-herramientas-electricas",
  );
  assert.ok(approved !== undefined);
  assert.equal(photo.sha256, approved.sha256);
  assert.equal(photo.role, "product_photo");
});

test("el logo se compone y nunca sale como referencia", () => {
  for (const asset of BRAND_ASSETS.filter((entry) =>
    entry.assetId.startsWith("brand/logo-"),
  )) {
    for (const role of ["product_photo", "store_context"] as const) {
      const decision = decideVisualReference(asset.assetId, role);
      assert.ok(isVisualAssetRejection(decision));
      assert.equal(decision.rejectionCode, "identity-asset");
    }
  }
});

test("un activo fuera de la biblioteca aprobada se rechaza", () => {
  const decision = decideVisualReference("foto-de-un-cliente", "product_photo");
  assert.ok(isVisualAssetRejection(decision));
  assert.equal(decision.rejectionCode, "asset-not-approved");
});

test("una foto del local es contexto y no producto", () => {
  const asContext = decideVisualReference(
    "brand/interior-herramientas",
    "store_context",
  );
  assert.ok(!isVisualAssetRejection(asContext));

  const asProduct = decideVisualReference(
    "brand/interior-herramientas",
    "product_photo",
  );
  assert.ok(isVisualAssetRejection(asProduct));
  assert.equal(asProduct.rejectionCode, "role-mismatch");
});

test("un ícono vectorial no sirve de referencia fotográfica", () => {
  for (const assetId of ["aceite", "epp", "pintura", "taladro"]) {
    const decision = decideVisualReference(assetId, "product_photo");
    assert.ok(isVisualAssetRejection(decision));
    assert.equal(decision.rejectionCode, "not-photographic");
  }
});

test("resolver referencias falla con el motivo en lugar de descartar", () => {
  assert.throws(
    () =>
      resolveVisualReferences([
        { assetId: "stock-plomeria", role: "product_photo" },
        { assetId: "brand/logo-ferreteria-dark", role: "product_photo" },
      ]),
    (cause: unknown) => {
      assert.ok(cause instanceof VisualPromptValidationError);
      assert.equal(cause.code, "reference-not-approved");
      assert.equal(cause.field, "references[1]");
      return true;
    },
  );
});

test("resolver referencias válidas conserva orden y hash", () => {
  const resolved = resolveVisualReferences([
    { assetId: "stock-plomeria", role: "product_photo" },
    { assetId: "brand/frente-central", role: "store_context" },
  ]);
  assert.deepEqual(
    resolved.map((reference) => reference.assetId),
    ["stock-plomeria", "brand/frente-central"],
  );
  for (const reference of resolved) {
    assert.match(reference.sha256, /^[0-9a-f]{64}$/u);
  }
});
