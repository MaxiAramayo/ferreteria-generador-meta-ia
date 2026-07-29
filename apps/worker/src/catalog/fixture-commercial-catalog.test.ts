import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommercialCatalogError,
  type CommercialCatalogPort,
} from "@aramayo/domain";

import {
  FixtureCommercialCatalogAdapter,
  FixturePromotionApprovalAdapter,
} from "./fixture-commercial-catalog.ts";

const organizationId = "organization-aramayo";

async function assertCommercialCatalogContract(
  catalog: CommercialCatalogPort,
): Promise<void> {
  const ambiguous = await catalog.searchProducts({
    organizationId,
    query: "amoladora angular",
  });
  assert.equal(ambiguous.matches.length, 3);
  assert.notEqual(
    ambiguous.matches[0]?.presentation,
    ambiguous.matches[1]?.presentation,
  );
  assert.equal(
    ambiguous.matches.filter((product) => product.sku === "AMO-BOS-700").length,
    2,
  );
  assert.equal(
    new Set(ambiguous.matches.map((product) => product.externalId)).size,
    3,
  );

  const discontinued = await catalog.getProduct({
    externalProductId: "odoo-product-301",
    organizationId,
  });
  assert.equal(discontinued.kind, "found");
  assert.equal(discontinued.product.status, "discontinued");

  const priced = await catalog.getPrice({
    externalProductId: "odoo-product-101",
    locationId: "casa-central",
    organizationId,
  });
  assert.equal(priced.kind, "priced");
  assert.equal(priced.currency, "ARS");
  assert.equal(priced.locationId, "casa-central");
  assert.equal(priced.unit, "unidad");
  assert.equal(priced.evidence.observedAt, "2026-07-29T15:00:00.000Z");

  const missingPrice = await catalog.getPrice({
    externalProductId: "odoo-product-201",
    locationId: "casa-central",
    organizationId,
  });
  assert.equal(missingPrice.kind, "missing");
  assert.equal(missingPrice.reason, "price-not-configured");

  const zeroStock = await catalog.getStock({
    externalProductId: "odoo-product-101",
    locationId: "casa-central",
    organizationId,
  });
  assert.equal(zeroStock.kind, "known");
  assert.equal(zeroStock.quantity, 0);

  const unknownStock = await catalog.getStock({
    externalProductId: "odoo-product-101",
    locationId: "rivadavia",
    organizationId,
  });
  assert.equal(unknownStock.kind, "unknown");
  assert.equal(unknownStock.reason, "stock-not-reported");

  const receipt = await catalog.getReceiptStatus({
    externalReceiptId: "receipt-confirmed-001",
    organizationId,
  });
  assert.equal(receipt.kind, "confirmed");
}

test("el adaptador cumple el contrato comercial con fixtures deterministas", async () => {
  await assertCommercialCatalogContract(new FixtureCommercialCatalogAdapter());
});

test("el scope de organización impide recuperar productos ajenos", async () => {
  const catalog = new FixtureCommercialCatalogAdapter();

  assert.deepEqual(
    await catalog.getProduct({
      externalProductId: "other-organization-product",
      organizationId,
    }),
    {
      evidence: {
        observedAt: "2026-07-29T15:00:00.000Z",
        reference: "fixture:commercial-catalog:v1",
        sourceKind: "fixture",
      },
      kind: "not-found",
    },
  );
  assert.equal(
    (
      await catalog.searchProducts({
        organizationId,
        query: "Producto ajeno",
      })
    ).matches.length,
    0,
  );
});

test("latencia y fallos se simulan sin perder la categoría de error", async () => {
  const catalog = new FixtureCommercialCatalogAdapter({
    failures: [{ code: "timeout", operation: "get-price" }],
    latencyMilliseconds: 5,
  });
  const startedAt = performance.now();

  await assert.rejects(
    catalog.getPrice({
      externalProductId: "odoo-product-101",
      locationId: "casa-central",
      organizationId,
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError &&
      cause.code === "timeout" &&
      cause.retryable,
  );
  assert.ok(performance.now() - startedAt >= 4);

  const unavailableCatalog = new FixtureCommercialCatalogAdapter({
    failures: [{ code: "unavailable", operation: "get-stock" }],
  });
  await assert.rejects(
    unavailableCatalog.getStock({
      externalProductId: "odoo-product-101",
      locationId: "casa-central",
      organizationId,
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError &&
      cause.code === "unavailable" &&
      cause.retryable,
  );
});

test("los límites rechazan búsquedas y campos que podrían ampliar la consulta", async () => {
  const catalog = new FixtureCommercialCatalogAdapter();

  await assert.rejects(
    catalog.searchProducts({
      limit: 26,
      organizationId,
      query: "amoladora",
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError &&
      cause.code === "invalid-request" &&
      !cause.retryable,
  );
  await assert.rejects(
    catalog.getProduct({
      externalProductId: "product-1; DROP TABLE products",
      organizationId,
    }),
    CommercialCatalogError,
  );
});

test("la promoción exige aprobación de la revisión, condiciones y vigencia", async () => {
  const approvals = new FixturePromotionApprovalAdapter();

  const active = await approvals.getPromotionApproval({
    at: "2026-07-30T12:00:00.000Z",
    organizationId,
    publicationRevisionId: "revision-promotion-001",
  });
  assert.equal(active.kind, "approved");
  assert.equal(active.approval.conditions.length, 2);
  assert.equal(active.approval.approverRole, "Responsable de negocio");
  assert.equal(active.approval.evidence.sourceKind, "manual");

  assert.deepEqual(
    await approvals.getPromotionApproval({
      at: "2026-08-01T00:00:00.000Z",
      organizationId,
      publicationRevisionId: "revision-promotion-001",
    }),
    { kind: "not-effective", reason: "expired" },
  );
  assert.deepEqual(
    await approvals.getPromotionApproval({
      at: "2026-07-30T12:00:00.000Z",
      organizationId,
      publicationRevisionId: "revision-without-approval",
    }),
    { kind: "not-found" },
  );
});
