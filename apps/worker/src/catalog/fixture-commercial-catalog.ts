import {
  commercialCatalogLimits,
  CommercialCatalogError,
  type CommercialCatalogPort,
  type CommercialEvidence,
  type CommercialProduct,
  type GetPriceQuery,
  type GetProductQuery,
  type GetPromotionApprovalQuery,
  type GetReceiptStatusQuery,
  type GetStockQuery,
  type PriceLookupResult,
  type ProductLookupResult,
  type PromotionApprovalPort,
  type PromotionApprovalResult,
  type ReceiptStatusResult,
  type SearchProductsQuery,
  type SearchProductsResult,
  type StockLookupResult,
} from "@aramayo/domain";

import {
  fixtureProducts,
  fixturePromotionApprovals,
  fixtureReceipts,
  type FixtureProduct,
} from "./commercial-catalog.fixtures.ts";

export type FixtureCommercialOperation =
  | "get-price"
  | "get-product"
  | "get-receipt-status"
  | "get-stock"
  | "search-products";

export interface FixtureCommercialFailure {
  readonly code: "timeout" | "unavailable";
  readonly operation: FixtureCommercialOperation;
}

export interface FixtureCommercialCatalogOptions {
  readonly failures?: readonly FixtureCommercialFailure[];
  readonly latencyMilliseconds?: number;
}

const fixtureReference = "fixture:commercial-catalog:v1";
const promotionFixtureReference = "fixture:promotion-approvals:v1";
const fixtureObservedAt = "2026-07-29T15:00:00.000Z";

function normalizeSearchTerm(term: string): string {
  return term
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR");
}

function evidence(
  observedAt: string,
  reference: string = fixtureReference,
): CommercialEvidence {
  return {
    observedAt,
    reference,
    sourceKind: reference === fixtureReference ? "fixture" : "manual",
  };
}

function toProduct(product: FixtureProduct): CommercialProduct {
  return {
    brand: product.brand,
    category: product.category,
    evidence: evidence(product.observedAt),
    externalId: product.externalId,
    name: product.name,
    presentation: product.presentation,
    saleUnit: product.saleUnit,
    sku: product.sku,
    status: product.status,
  };
}

function validateIdentifier(identifier: string, field: string): string {
  const normalized = identifier.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(normalized)
  ) {
    throw new CommercialCatalogError(
      "invalid-request",
      `${field} no tiene un identificador válido.`,
      false,
    );
  }
  return normalized;
}

function validateIsoTimestamp(timestamp: string): number {
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    throw new CommercialCatalogError(
      "invalid-request",
      "at debe ser un timestamp ISO válido.",
      false,
    );
  }
  return milliseconds;
}

export class FixtureCommercialCatalogAdapter implements CommercialCatalogPort {
  readonly #failures: readonly FixtureCommercialFailure[];
  readonly #latencyMilliseconds: number;

  constructor(options: FixtureCommercialCatalogOptions = {}) {
    const latencyMilliseconds = options.latencyMilliseconds ?? 0;
    if (
      !Number.isSafeInteger(latencyMilliseconds) ||
      latencyMilliseconds < 0 ||
      latencyMilliseconds > 5_000
    ) {
      throw new CommercialCatalogError(
        "invalid-request",
        "La latencia del fixture debe estar entre 0 y 5000 ms.",
        false,
      );
    }
    this.#failures = options.failures ?? Object.freeze([]);
    this.#latencyMilliseconds = latencyMilliseconds;
  }

  async searchProducts(
    query: SearchProductsQuery,
  ): Promise<SearchProductsResult> {
    const organizationId = validateIdentifier(
      query.organizationId,
      "organizationId",
    );
    const normalizedQuery = query.query.trim();
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
    await this.#before("search-products");
    const searchTerm = normalizeSearchTerm(normalizedQuery);
    const matches = fixtureProducts
      .filter(
        (product) =>
          product.organizationId === organizationId &&
          normalizeSearchTerm(
            [
              product.sku,
              product.name,
              product.brand,
              product.presentation,
              product.category,
            ].join(" "),
          ).includes(searchTerm),
      )
      .sort((left, right) => left.sku.localeCompare(right.sku))
      .map(toProduct);
    return {
      evidence: evidence(fixtureObservedAt),
      matches: Object.freeze(matches.slice(0, limit)),
      truncated: matches.length > limit,
    };
  }

  async getProduct(query: GetProductQuery): Promise<ProductLookupResult> {
    const product = this.#findProduct(query);
    await this.#before("get-product");
    return product === undefined
      ? { evidence: evidence(fixtureObservedAt), kind: "not-found" }
      : { kind: "found", product: toProduct(product) };
  }

  async getPrice(query: GetPriceQuery): Promise<PriceLookupResult> {
    const locationId = validateIdentifier(query.locationId, "locationId");
    const product = this.#findProduct(query);
    await this.#before("get-price");
    const base = {
      currency: "ARS" as const,
      evidence: evidence(product?.observedAt ?? fixtureObservedAt),
      locationId,
      unit: product?.saleUnit ?? "unidad",
    };
    if (product === undefined) {
      return { ...base, kind: "missing", reason: "product-not-found" };
    }
    if (product.status === "discontinued") {
      return { ...base, kind: "missing", reason: "discontinued" };
    }
    const price = product.prices.find(
      (candidate) => candidate.locationId === locationId,
    );
    return price === undefined
      ? { ...base, kind: "missing", reason: "price-not-configured" }
      : { ...base, amountMinor: price.amountMinor, kind: "priced" };
  }

  async getStock(query: GetStockQuery): Promise<StockLookupResult> {
    const locationId = validateIdentifier(query.locationId, "locationId");
    const product = this.#findProduct(query);
    await this.#before("get-stock");
    const base = {
      evidence: evidence(product?.observedAt ?? fixtureObservedAt),
      locationId,
      unit: product?.saleUnit ?? "unidad",
    };
    if (product === undefined) {
      return { ...base, kind: "unknown", reason: "product-not-found" };
    }
    const stock = product.stocks.find(
      (candidate) => candidate.locationId === locationId,
    );
    if (stock === undefined) {
      return { ...base, kind: "unknown", reason: "location-not-configured" };
    }
    return stock.quantity === undefined
      ? { ...base, kind: "unknown", reason: "stock-not-reported" }
      : { ...base, kind: "known", quantity: stock.quantity };
  }

  async getReceiptStatus(
    query: GetReceiptStatusQuery,
  ): Promise<ReceiptStatusResult> {
    const organizationId = validateIdentifier(
      query.organizationId,
      "organizationId",
    );
    const externalReceiptId = validateIdentifier(
      query.externalReceiptId,
      "externalReceiptId",
    );
    await this.#before("get-receipt-status");
    const receipt = fixtureReceipts.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.externalReceiptId === externalReceiptId,
    );
    if (receipt === undefined) {
      return { evidence: evidence(fixtureObservedAt), kind: "not-found" };
    }
    const base = {
      evidence: evidence(receipt.observedAt),
      externalReceiptId: receipt.externalReceiptId,
    };
    return receipt.confirmedAt === undefined
      ? { ...base, kind: "not-confirmed" }
      : { ...base, confirmedAt: receipt.confirmedAt, kind: "confirmed" };
  }

  #findProduct(query: GetProductQuery): FixtureProduct | undefined {
    const organizationId = validateIdentifier(
      query.organizationId,
      "organizationId",
    );
    const externalProductId = validateIdentifier(
      query.externalProductId,
      "externalProductId",
    );
    return fixtureProducts.find(
      (product) =>
        product.organizationId === organizationId &&
        product.externalId === externalProductId,
    );
  }

  async #before(operation: FixtureCommercialOperation): Promise<void> {
    if (this.#latencyMilliseconds > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.#latencyMilliseconds);
      });
    }
    const failure = this.#failures.find(
      (candidate) => candidate.operation === operation,
    );
    if (failure !== undefined) {
      throw new CommercialCatalogError(
        failure.code,
        failure.code === "timeout"
          ? "La consulta comercial superó el tiempo permitido."
          : "El sistema comercial no está disponible.",
        true,
      );
    }
  }
}

export class FixturePromotionApprovalAdapter implements PromotionApprovalPort {
  getPromotionApproval(
    query: GetPromotionApprovalQuery,
  ): Promise<PromotionApprovalResult> {
    const organizationId = validateIdentifier(
      query.organizationId,
      "organizationId",
    );
    const publicationRevisionId = validateIdentifier(
      query.publicationRevisionId,
      "publicationRevisionId",
    );
    const requestedAt = validateIsoTimestamp(query.at);
    const approval = fixturePromotionApprovals.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.publicationRevisionId === publicationRevisionId,
    );
    if (approval === undefined) {
      return Promise.resolve({ kind: "not-found" });
    }
    if (requestedAt < Date.parse(approval.effectiveFrom)) {
      return Promise.resolve({
        kind: "not-effective",
        reason: "not-started",
      });
    }
    if (requestedAt > Date.parse(approval.effectiveUntil)) {
      return Promise.resolve({ kind: "not-effective", reason: "expired" });
    }
    return Promise.resolve({
      approval: {
        approvalId: approval.approvalId,
        approvedAt: approval.approvedAt,
        approverRole: "Responsable de negocio",
        conditions: approval.conditions,
        effectiveFrom: approval.effectiveFrom,
        effectiveUntil: approval.effectiveUntil,
        evidence: evidence(approval.approvedAt, promotionFixtureReference),
        publicationRevisionId: approval.publicationRevisionId,
      },
      kind: "approved",
    });
  }
}
