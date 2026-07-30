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
  CommercialToolExecutionError,
  type CommercialCatalogPort,
  type CommercialEvidence,
  type CommercialProduct,
  type CommercialToolAuditEvent,
  type CommercialToolAuditPort,
} from "@aramayo/domain";

import { commercialToolDefinitions } from "./commercial-tool-definitions.ts";
import {
  CommercialToolExecutionService,
  type CommercialToolExecutionSession,
} from "./commercial-tool-execution.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const actorMembershipId = "10000000-0000-4000-8000-000000000007";
const locationId = "10000000-0000-4000-8000-000000000004";
const runId = "10000000-0000-4000-8000-000000000008";
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
  maximumCallsPerRun: 2,
  requestTimeoutMilliseconds: 8_000,
});

function evidence(): CommercialEvidence {
  return {
    observedAt,
    reference: "fixture:commercial-tool-test",
    sourceKind: "fixture" as const,
  };
}

function product(
  overrides: Partial<CommercialProduct> = {},
): CommercialProduct {
  return {
    brand: "Bosch",
    category: "Herramientas",
    evidence: evidence(),
    externalId: "odoo-product-101",
    name: "Amoladora angular",
    presentation: "700 W",
    saleUnit: "unidad",
    sku: "AMO-BOS-700",
    status: "active",
    ...overrides,
  };
}

class RecordingCatalog implements CommercialCatalogPort {
  readonly calls: string[] = [];
  locationId: string | null = null;
  searchProduct = product();
  timeout = false;

  getPrice(
    query: Parameters<CommercialCatalogPort["getPrice"]>[0],
  ): ReturnType<CommercialCatalogPort["getPrice"]> {
    this.calls.push("get-price");
    this.locationId = query.locationId;
    return Promise.resolve({
      amountMinor: 123_456,
      currency: "ARS" as const,
      evidence: evidence(),
      kind: "priced" as const,
      locationId: query.locationId,
      unit: "unidad",
    });
  }

  getProduct(
    query: Parameters<CommercialCatalogPort["getProduct"]>[0],
  ): ReturnType<CommercialCatalogPort["getProduct"]> {
    this.calls.push("get-product");
    if (this.timeout) {
      return Promise.reject(
        new CommercialCatalogError(
          "timeout",
          "La consulta superó el tiempo permitido.",
          true,
        ),
      );
    }
    return Promise.resolve({
      kind: "found" as const,
      product: { ...product(), externalId: query.externalProductId },
    });
  }

  getReceiptStatus(
    query: Parameters<CommercialCatalogPort["getReceiptStatus"]>[0],
  ): ReturnType<CommercialCatalogPort["getReceiptStatus"]> {
    this.calls.push("get-receipt-status");
    return Promise.resolve({
      evidence: evidence(),
      externalReceiptId: query.externalReceiptId,
      kind: "not-confirmed" as const,
    });
  }

  getStock(
    query: Parameters<CommercialCatalogPort["getStock"]>[0],
  ): ReturnType<CommercialCatalogPort["getStock"]> {
    this.calls.push("get-stock");
    this.locationId = query.locationId;
    return Promise.resolve({
      evidence: evidence(),
      kind: "known" as const,
      locationId: query.locationId,
      quantity: 0,
      unit: "unidad",
    });
  }

  searchProducts(
    query: Parameters<CommercialCatalogPort["searchProducts"]>[0],
  ): ReturnType<CommercialCatalogPort["searchProducts"]> {
    this.calls.push("search-products");
    return Promise.resolve({
      evidence: evidence(),
      matches: [this.searchProduct].slice(0, query.limit),
      truncated: false,
    });
  }
}

class RecordingAudit implements CommercialToolAuditPort {
  readonly events: CommercialToolAuditEvent[] = [];
  fail = false;

  record(event: CommercialToolAuditEvent): Promise<void> {
    if (this.fail) {
      return Promise.reject(new Error("audit unavailable"));
    }
    this.events.push(event);
    return Promise.resolve();
  }
}

function session(
  catalog: RecordingCatalog,
  audit: RecordingAudit,
  overrides: Partial<CommercialCatalogPolicy> = {},
): CommercialToolExecutionSession {
  return new CommercialToolExecutionService(
    catalog,
    audit,
    credentials,
    { ...policy, ...overrides },
    {
      clock: (): number => Date.parse("2026-07-29T16:00:00.000Z"),
      eventId: randomUUID,
    },
  ).createSession({
    actorMembershipId,
    locationId,
    organizationId,
    runId,
  });
}

function outputErrorCode(output: string): string {
  const parsed: unknown = JSON.parse(output);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("El output de herramienta no es un objeto.");
  }
  const error = (parsed as Readonly<Record<string, unknown>>)["error"];
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    throw new TypeError("El output de herramienta no contiene error.");
  }
  const code = (error as Readonly<Record<string, unknown>>)["code"];
  if (typeof code !== "string") {
    throw new TypeError("El error de herramienta no contiene código.");
  }
  return code;
}

test("publica cinco esquemas estrictos sin scope controlable por el modelo", () => {
  assert.equal(commercialToolDefinitions.length, 5);
  for (const definition of commercialToolDefinitions) {
    assert.equal(definition.strict, true);
    assert.equal(definition.parameters.additionalProperties, false);
    assert.deepEqual(
      [...definition.parameters.required].sort(),
      Object.keys(definition.parameters.properties).sort(),
    );
    assert.equal(
      Object.hasOwn(definition.parameters.properties, "organizationId"),
      false,
    );
    assert.equal(
      Object.hasOwn(definition.parameters.properties, "locationId"),
      false,
    );
  }
});

test("deriva organización y sucursal del scope y audita parámetros minimizados", async () => {
  const catalog = new RecordingCatalog();
  const audit = new RecordingAudit();
  const execution = session(catalog, audit);

  const price = await execution.execute({
    arguments: JSON.stringify({ externalProductId: "odoo-product-101" }),
    callId: "call_price_1",
    name: "get_current_price",
  });

  assert.equal(price.outcome, "success");
  assert.equal(catalog.locationId, "casa-central");
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0]?.organizationId, organizationId);
  assert.equal(audit.events[0].actorMembershipId, actorMembershipId);
  assert.equal(audit.events[0].toolName, "get_current_price");
  assert.equal(
    JSON.stringify(audit.events[0]).includes("odoo-product-101"),
    false,
  );
});

test("rechaza argumentos extra, SQL e intentos de scope cruzado antes de red", async () => {
  const catalog = new RecordingCatalog();
  const audit = new RecordingAudit();
  const execution = session(catalog, audit);

  const poisoned = await execution.execute({
    arguments: JSON.stringify({
      limit: 10,
      locationId: "rivadavia",
      organizationId: "otra-organizacion",
      query: "amoladora'; DROP TABLE product_product",
    }),
    callId: "call_poisoned",
    name: "search_products",
  });
  assert.equal(poisoned.outcome, "failure");
  assert.equal(catalog.calls.length, 0);
  assert.equal(JSON.stringify(audit.events).includes("DROP TABLE"), false);

  const crossScope = new CommercialToolExecutionService(
    catalog,
    audit,
    credentials,
    policy,
  ).createSession({
    actorMembershipId,
    locationId,
    organizationId: "20000000-0000-4000-8000-000000000001",
    runId,
  });
  await assert.rejects(
    crossScope.execute({
      arguments: JSON.stringify({ externalProductId: "odoo-product-101" }),
      callId: "call_cross_scope",
      name: "get_product",
    }),
    (cause: unknown) =>
      cause instanceof CommercialToolExecutionError &&
      cause.code === "invalid-scope",
  );
  assert.equal(catalog.calls.length, 0);
  assert.equal(audit.events.at(-1)?.outcome, "failure");
});

test("limita llamadas, resultados grandes y normaliza timeout", async () => {
  const catalog = new RecordingCatalog();
  const audit = new RecordingAudit();
  const execution = session(catalog, audit, { maximumCallsPerRun: 2 });
  const productCall = {
    arguments: JSON.stringify({ externalProductId: "odoo-product-101" }),
    name: "get_product",
  } as const;

  assert.equal(
    (
      await execution.execute({
        ...productCall,
        callId: "call_product_1",
      })
    ).outcome,
    "success",
  );
  catalog.timeout = true;
  const timedOut = await execution.execute({
    ...productCall,
    callId: "call_product_2",
  });
  assert.equal(timedOut.outcome, "failure");
  assert.equal(outputErrorCode(timedOut.output), "timeout");

  const limited = await execution.execute({
    ...productCall,
    callId: "call_product_3",
  });
  assert.equal(limited.outcome, "failure");
  assert.equal(outputErrorCode(limited.output), "rate-limit");
  assert.equal(catalog.calls.length, 2);

  const largeCatalog = new RecordingCatalog();
  largeCatalog.searchProduct = product({ name: "x".repeat(13_000) });
  const oversized = await session(largeCatalog, new RecordingAudit()).execute({
    arguments: JSON.stringify({ limit: 1, query: "amoladora" }),
    callId: "call_large_result",
    name: "search_products",
  });
  assert.equal(oversized.outcome, "failure");
  assert.equal(outputErrorCode(oversized.output), "unavailable");
});

test("un fallo de auditoría bloquea incluso un resultado comercial exitoso", async () => {
  const catalog = new RecordingCatalog();
  const audit = new RecordingAudit();
  audit.fail = true;

  await assert.rejects(
    session(catalog, audit).execute({
      arguments: JSON.stringify({ externalProductId: "odoo-product-101" }),
      callId: "call_without_audit",
      name: "get_product",
    }),
    (cause: unknown) =>
      cause instanceof CommercialToolExecutionError &&
      cause.code === "audit-failed",
  );
  assert.equal(catalog.calls.length, 1);
});
