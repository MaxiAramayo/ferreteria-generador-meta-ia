import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  SecretValue,
  type CommercialCatalogCredentials,
  type CommercialCatalogPolicy,
} from "@aramayo/configuration";
import {
  CommercialCatalogError,
  type CommercialEvidence,
  type CommercialProduct,
} from "@aramayo/domain";

import { OdooCommercialCatalogAdapter } from "./odoo-commercial-catalog.adapter.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000004";
const observedAt = "2026-07-29T15:00:00.000Z";

const credentials: CommercialCatalogCredentials = Object.freeze({
  baseUrl: "https://ferreteriaaramayo.com.ar/api/content/v1/",
  locationMappings: Object.freeze([
    Object.freeze({
      externalLocationId: "casa-central",
      platformLocationId: locationId,
    }),
  ]),
  organizationId,
  token: new SecretValue("content-api-test-token-value-secure"),
});

const policy: CommercialCatalogPolicy = Object.freeze({
  maximumCallsPerRun: 8,
  requestTimeoutMilliseconds: 100,
});

function commercialEvidence(reference: string): CommercialEvidence {
  return {
    observedAt,
    reference,
    sourceKind: "odoo",
  };
}

function commercialProduct(): CommercialProduct {
  return {
    brand: "Bosch",
    category: "Herramientas / Eléctricas",
    evidence: commercialEvidence("odoo:product.product:101"),
    externalId: "odoo-product-101",
    name: "Amoladora angular",
    presentation: "700 W",
    saleUnit: "unidad",
    sku: "AMO-BOS-700",
    status: "active",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

test("consulta exclusivamente rutas GET fijas y proyecta el contrato mínimo", async () => {
  const requests: URL[] = [];
  const adapter = new OdooCommercialCatalogAdapter(
    credentials,
    policy,
    (input, init) => {
      const url =
        input instanceof URL
          ? input
          : new URL(typeof input === "string" ? input : input.url);
      requests.push(url);
      assert.equal(init?.method, "GET");
      assert.equal(init.redirect, "error");
      if (url.pathname.endsWith("/products")) {
        return Promise.resolve(
          jsonResponse({
            evidence: commercialEvidence("odoo:product.product:search"),
            kind: "search-result",
            matches: [commercialProduct()],
            requestId: randomUUID(),
            truncated: false,
          }),
        );
      }
      if (url.pathname.endsWith("/price")) {
        return Promise.resolve(
          jsonResponse({
            amountMinor: 123_456,
            currency: "ARS",
            evidence: commercialEvidence(
              "odoo:product.product:101:price:casa-central",
            ),
            kind: "priced",
            locationId: "casa-central",
            requestId: randomUUID(),
            unit: "unidad",
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          evidence: commercialEvidence(
            "odoo:product.product:101:stock:casa-central",
          ),
          kind: "known",
          locationId: "casa-central",
          quantity: 0,
          requestId: randomUUID(),
          unit: "unidad",
        }),
      );
    },
  );

  const search = await adapter.searchProducts({
    limit: 1,
    organizationId,
    query: "amoladora",
  });
  const price = await adapter.getPrice({
    externalProductId: "odoo-product-101",
    locationId: "casa-central",
    organizationId,
  });
  const stock = await adapter.getStock({
    externalProductId: "odoo-product-101",
    locationId: "casa-central",
    organizationId,
  });

  assert.equal(search.matches.length, 1);
  assert.equal(price.kind, "priced");
  assert.equal(stock.kind, "known");
  assert.equal(stock.quantity, 0);
  assert.equal(requests[0]?.searchParams.get("limit"), "1");
  assert.equal(requests[1]?.searchParams.get("locationId"), "casa-central");
  assert.equal(requests[2]?.searchParams.get("locationId"), "casa-central");
});

test("rechaza scope cruzado e identificadores antes de realizar red", async () => {
  let calls = 0;
  const adapter = new OdooCommercialCatalogAdapter(credentials, policy, () => {
    calls += 1;
    return Promise.resolve(jsonResponse({}));
  });

  await assert.rejects(
    adapter.getProduct({
      externalProductId: "odoo-product-101",
      organizationId: "20000000-0000-4000-8000-000000000001",
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError &&
      cause.code === "invalid-request",
  );
  await assert.rejects(
    adapter.getProduct({
      externalProductId: "product.product;unlink",
      organizationId,
    }),
    CommercialCatalogError,
  );
  assert.equal(calls, 0);
});

test("rechaza campos remotos inesperados y respuestas sobredimensionadas", async () => {
  const sensitiveAdapter = new OdooCommercialCatalogAdapter(
    credentials,
    policy,
    () =>
      Promise.resolve(
        jsonResponse({
          kind: "found",
          product: {
            ...commercialProduct(),
            standardPrice: 999,
          },
          requestId: randomUUID(),
        }),
      ),
  );
  await assert.rejects(
    sensitiveAdapter.getProduct({
      externalProductId: "odoo-product-101",
      organizationId,
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError && cause.code === "unavailable",
  );

  const oversizedAdapter = new OdooCommercialCatalogAdapter(
    credentials,
    policy,
    () => Promise.resolve(jsonResponse({ padding: "x".repeat(70_000) })),
  );
  await assert.rejects(
    oversizedAdapter.getProduct({
      externalProductId: "odoo-product-101",
      organizationId,
    }),
    CommercialCatalogError,
  );
});

test("normaliza timeout y errores HTTP sin exponer el payload", async () => {
  const timeoutAdapter = new OdooCommercialCatalogAdapter(
    credentials,
    { ...policy, requestTimeoutMilliseconds: 5 },
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Timeout de prueba.", "TimeoutError"));
          },
          { once: true },
        );
      }),
  );
  const startedAt = performance.now();
  await assert.rejects(
    timeoutAdapter.getProduct({
      externalProductId: "odoo-product-101",
      organizationId,
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError &&
      cause.code === "timeout" &&
      cause.retryable,
  );
  assert.ok(performance.now() - startedAt >= 4);

  const unauthorizedAdapter = new OdooCommercialCatalogAdapter(
    credentials,
    policy,
    () => Promise.resolve(jsonResponse({}, 401)),
  );
  await assert.rejects(
    unauthorizedAdapter.getProduct({
      externalProductId: "odoo-product-101",
      organizationId,
    }),
    (cause: unknown) =>
      cause instanceof CommercialCatalogError &&
      cause.code === "unavailable" &&
      !cause.retryable,
  );
});
