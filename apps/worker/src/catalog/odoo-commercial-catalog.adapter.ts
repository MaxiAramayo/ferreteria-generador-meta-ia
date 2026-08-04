import type {
  CommercialCatalogCredentials,
  CommercialCatalogPolicy,
  CommercialExternalLocationId,
} from "@aramayo/configuration";
import {
  CommercialCatalogError,
  commercialCatalogLimits,
  type CommercialCatalogPort,
  type CommercialEvidence,
  type CommercialProduct,
  type GetPriceQuery,
  type GetProductQuery,
  type GetReceiptStatusQuery,
  type GetStockQuery,
  type PriceLookupResult,
  type ProductLookupResult,
  type ReceiptStatusResult,
  type SearchProductsQuery,
  type SearchProductsResult,
  type StockLookupResult,
} from "@aramayo/domain";

const maximumResponseBytes = 65_536;
const externalProductIdPattern = /^odoo-product-[1-9][0-9]*$/u;
const externalReceiptIdPattern = /^odoo-receipt-[1-9][0-9]*$/u;
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type HttpFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

type UnknownRecord = Readonly<Record<string, unknown>>;

function invalidResponse(): CommercialCatalogError {
  return new CommercialCatalogError(
    "unavailable",
    "La API comercial devolvió una respuesta inválida.",
    false,
  );
}

function record(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse();
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw invalidResponse();
  }
}

function boundedString(value: unknown, maximum: number, minimum = 0): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw invalidResponse();
  }
  return value;
}

function isoTimestamp(value: unknown): string {
  const timestamp = boundedString(value, 40, 20);
  if (
    !Number.isFinite(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !== timestamp
  ) {
    throw invalidResponse();
  }
  return timestamp;
}

function evidence(value: unknown): CommercialEvidence {
  const source = record(value);
  exactKeys(source, ["observedAt", "reference", "sourceKind"]);
  if (source["sourceKind"] !== "odoo") {
    throw invalidResponse();
  }
  return Object.freeze({
    observedAt: isoTimestamp(source["observedAt"]),
    reference: boundedString(source["reference"], 200, 1),
    sourceKind: "odoo",
  });
}

function requestId(value: unknown): string {
  const identifier = boundedString(value, 60, 1);
  if (!requestIdPattern.test(identifier)) {
    throw invalidResponse();
  }
  return identifier;
}

function product(value: unknown): CommercialProduct {
  const source = record(value);
  exactKeys(source, [
    "brand",
    "category",
    "evidence",
    "externalId",
    "name",
    "presentation",
    "saleUnit",
    "sku",
    "status",
  ]);
  const externalId = boundedString(source["externalId"], 80, 1);
  if (!externalProductIdPattern.test(externalId)) {
    throw invalidResponse();
  }
  if (source["status"] !== "active" && source["status"] !== "discontinued") {
    throw invalidResponse();
  }
  return Object.freeze({
    brand: boundedString(source["brand"], 120),
    category: boundedString(source["category"], 240, 1),
    evidence: evidence(source["evidence"]),
    externalId,
    name: boundedString(source["name"], 180, 1),
    presentation: boundedString(source["presentation"], 180, 1),
    saleUnit: boundedString(source["saleUnit"], 80, 1),
    sku: boundedString(source["sku"], 80),
    status: source["status"],
  });
}

function externalProductId(value: string): string {
  const normalized = value.trim();
  if (!externalProductIdPattern.test(normalized)) {
    throw new CommercialCatalogError(
      "invalid-request",
      "externalProductId no es válido.",
      false,
    );
  }
  return normalized;
}

function externalReceiptId(value: string): string {
  const normalized = value.trim();
  if (!externalReceiptIdPattern.test(normalized)) {
    throw new CommercialCatalogError(
      "invalid-request",
      "externalReceiptId no es válido.",
      false,
    );
  }
  return normalized;
}

function externalLocationId(value: string): CommercialExternalLocationId {
  if (value !== "casa-central" && value !== "rivadavia") {
    throw new CommercialCatalogError(
      "invalid-request",
      "locationId no es válido.",
      false,
    );
  }
  return value;
}

function resultBase(
  payload: UnknownRecord,
  locationId: CommercialExternalLocationId,
): Readonly<{
  evidence: CommercialEvidence;
  locationId: string;
  unit: string;
}> {
  if (payload["locationId"] !== locationId) {
    throw invalidResponse();
  }
  return Object.freeze({
    evidence: evidence(payload["evidence"]),
    locationId,
    unit: boundedString(payload["unit"], 80, 1),
  });
}

async function boundedResponseText(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > maximumResponseBytes
  ) {
    throw invalidResponse();
  }
  if (response.body === null) {
    throw invalidResponse();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumResponseBytes) {
    throw invalidResponse();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function normalizeHttpFailure(status: number): CommercialCatalogError {
  if (status === 400) {
    return new CommercialCatalogError(
      "invalid-request",
      "La API comercial rechazó la consulta.",
      false,
    );
  }
  return new CommercialCatalogError(
    "unavailable",
    "La API comercial no está disponible.",
    status === 408 || status === 429 || status >= 500,
  );
}

export class OdooCommercialCatalogAdapter implements CommercialCatalogPort {
  readonly #credentials: CommercialCatalogCredentials;
  readonly #fetch: HttpFetch;
  readonly #policy: CommercialCatalogPolicy;

  constructor(
    credentials: CommercialCatalogCredentials,
    policy: CommercialCatalogPolicy,
    httpFetch: HttpFetch = fetch,
  ) {
    this.#credentials = credentials;
    this.#fetch = httpFetch;
    this.#policy = policy;
  }

  async searchProducts(
    query: SearchProductsQuery,
  ): Promise<SearchProductsResult> {
    this.#assertOrganization(query.organizationId);
    const normalizedQuery = query.query.trim().replaceAll(/\s+/gu, " ");
    const limit = query.limit ?? commercialCatalogLimits.searchResultsDefault;
    if (
      normalizedQuery.length < 2 ||
      normalizedQuery.length > commercialCatalogLimits.searchQueryMaximum ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > commercialCatalogLimits.searchResultsMaximum
    ) {
      throw new CommercialCatalogError(
        "invalid-request",
        "La búsqueda comercial no respeta sus límites.",
        false,
      );
    }
    const url = this.#url("products");
    url.searchParams.set("query", normalizedQuery);
    url.searchParams.set("limit", String(limit));
    const payload = await this.#get(url);
    exactKeys(payload, [
      "evidence",
      "kind",
      "matches",
      "requestId",
      "truncated",
    ]);
    if (
      payload["kind"] !== "search-result" ||
      typeof payload["truncated"] !== "boolean" ||
      !Array.isArray(payload["matches"]) ||
      payload["matches"].length > limit
    ) {
      throw invalidResponse();
    }
    requestId(payload["requestId"]);
    return Object.freeze({
      evidence: evidence(payload["evidence"]),
      matches: Object.freeze(payload["matches"].map(product)),
      truncated: payload["truncated"],
    });
  }

  async getProduct(query: GetProductQuery): Promise<ProductLookupResult> {
    this.#assertOrganization(query.organizationId);
    const payload = await this.#get(
      this.#url(`products/${externalProductId(query.externalProductId)}`),
    );
    if (payload["kind"] === "found") {
      exactKeys(payload, ["kind", "product", "requestId"]);
      requestId(payload["requestId"]);
      return Object.freeze({
        kind: "found",
        product: product(payload["product"]),
      });
    }
    exactKeys(payload, ["evidence", "kind", "requestId"]);
    if (payload["kind"] !== "not-found") {
      throw invalidResponse();
    }
    requestId(payload["requestId"]);
    return Object.freeze({
      evidence: evidence(payload["evidence"]),
      kind: "not-found",
    });
  }

  async getPrice(query: GetPriceQuery): Promise<PriceLookupResult> {
    this.#assertOrganization(query.organizationId);
    const locationId = externalLocationId(query.locationId);
    const url = this.#url(
      `products/${externalProductId(query.externalProductId)}/price`,
    );
    url.searchParams.set("locationId", locationId);
    const payload = await this.#get(url);
    const base = resultBase(payload, locationId);
    if (payload["kind"] === "priced") {
      exactKeys(payload, [
        "amountMinor",
        "currency",
        "evidence",
        "kind",
        "locationId",
        "requestId",
        "unit",
      ]);
      if (
        payload["currency"] !== "ARS" ||
        !Number.isSafeInteger(payload["amountMinor"]) ||
        Number(payload["amountMinor"]) < 0
      ) {
        throw invalidResponse();
      }
      requestId(payload["requestId"]);
      return Object.freeze({
        ...base,
        amountMinor: Number(payload["amountMinor"]),
        currency: "ARS",
        kind: "priced",
      });
    }
    exactKeys(payload, [
      "currency",
      "evidence",
      "kind",
      "locationId",
      "reason",
      "requestId",
      "unit",
    ]);
    if (
      payload["kind"] !== "missing" ||
      payload["currency"] !== "ARS" ||
      (payload["reason"] !== "discontinued" &&
        payload["reason"] !== "price-not-configured" &&
        payload["reason"] !== "product-not-found")
    ) {
      throw invalidResponse();
    }
    requestId(payload["requestId"]);
    return Object.freeze({
      ...base,
      currency: "ARS",
      kind: "missing",
      reason: payload["reason"],
    });
  }

  async getStock(query: GetStockQuery): Promise<StockLookupResult> {
    this.#assertOrganization(query.organizationId);
    const locationId = externalLocationId(query.locationId);
    const url = this.#url(
      `products/${externalProductId(query.externalProductId)}/stock`,
    );
    url.searchParams.set("locationId", locationId);
    const payload = await this.#get(url);
    const base = resultBase(payload, locationId);
    if (payload["kind"] === "known") {
      exactKeys(payload, [
        "evidence",
        "kind",
        "locationId",
        "quantity",
        "requestId",
        "unit",
      ]);
      if (
        typeof payload["quantity"] !== "number" ||
        !Number.isFinite(payload["quantity"]) ||
        payload["quantity"] < 0
      ) {
        throw invalidResponse();
      }
      requestId(payload["requestId"]);
      return Object.freeze({
        ...base,
        kind: "known",
        quantity: payload["quantity"],
      });
    }
    exactKeys(payload, [
      "evidence",
      "kind",
      "locationId",
      "reason",
      "requestId",
      "unit",
    ]);
    if (
      payload["kind"] !== "unknown" ||
      (payload["reason"] !== "location-not-configured" &&
        payload["reason"] !== "product-not-found" &&
        payload["reason"] !== "stock-not-reported")
    ) {
      throw invalidResponse();
    }
    requestId(payload["requestId"]);
    return Object.freeze({
      ...base,
      kind: "unknown",
      reason: payload["reason"],
    });
  }

  async getReceiptStatus(
    query: GetReceiptStatusQuery,
  ): Promise<ReceiptStatusResult> {
    this.#assertOrganization(query.organizationId);
    const identifier = externalReceiptId(query.externalReceiptId);
    const payload = await this.#get(this.#url(`receipts/${identifier}`));
    if (payload["kind"] === "not-found") {
      exactKeys(payload, ["evidence", "kind", "requestId"]);
      requestId(payload["requestId"]);
      return Object.freeze({
        evidence: evidence(payload["evidence"]),
        kind: "not-found",
      });
    }
    const required = ["evidence", "externalReceiptId", "kind", "requestId"];
    exactKeys(
      payload,
      payload["kind"] === "confirmed" ? [...required, "confirmedAt"] : required,
    );
    if (
      payload["externalReceiptId"] !== identifier ||
      (payload["kind"] !== "confirmed" && payload["kind"] !== "not-confirmed")
    ) {
      throw invalidResponse();
    }
    requestId(payload["requestId"]);
    const base = Object.freeze({
      evidence: evidence(payload["evidence"]),
      externalReceiptId: identifier,
    });
    return payload["kind"] === "confirmed"
      ? Object.freeze({
          ...base,
          confirmedAt: isoTimestamp(payload["confirmedAt"]),
          kind: "confirmed",
        })
      : Object.freeze({ ...base, kind: "not-confirmed" });
  }

  #assertOrganization(organizationId: string): void {
    if (organizationId !== this.#credentials.organizationId) {
      throw new CommercialCatalogError(
        "invalid-request",
        "La organización no tiene acceso a este catálogo.",
        false,
      );
    }
  }

  async #get(url: URL): Promise<UnknownRecord> {
    try {
      const response = await this.#fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#credentials.token.reveal()}`,
        },
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(this.#policy.requestTimeoutMilliseconds),
      });
      if (!response.ok) {
        throw normalizeHttpFailure(response.status);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        throw invalidResponse();
      }
      return record(JSON.parse(await boundedResponseText(response)));
    } catch (cause: unknown) {
      if (cause instanceof CommercialCatalogError) {
        throw cause;
      }
      if (
        (cause instanceof DOMException && cause.name === "TimeoutError") ||
        (cause instanceof Error && cause.name === "AbortError")
      ) {
        throw new CommercialCatalogError(
          "timeout",
          "La consulta comercial superó el tiempo permitido.",
          true,
        );
      }
      throw new CommercialCatalogError(
        "unavailable",
        "La API comercial no está disponible.",
        true,
      );
    }
  }

  #url(relativePath: string): URL {
    return new URL(relativePath, this.#credentials.baseUrl);
  }
}
