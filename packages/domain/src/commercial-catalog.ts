import type { OrganizationScope } from "./persistence.ts";

export const commercialCatalogLimits = Object.freeze({
  searchQueryMaximum: 120,
  searchResultsDefault: 10,
  searchResultsMaximum: 25,
});

export type CommercialSourceKind = "fixture" | "manual" | "odoo";

export interface CommercialEvidence {
  readonly observedAt: string;
  readonly reference: string;
  readonly sourceKind: CommercialSourceKind;
}

export type CommercialProductStatus = "active" | "discontinued";

export interface CommercialProduct {
  readonly brand: string;
  readonly category: string;
  readonly evidence: CommercialEvidence;
  readonly externalId: string;
  readonly name: string;
  readonly presentation: string;
  readonly saleUnit: string;
  readonly sku: string;
  readonly status: CommercialProductStatus;
}

export interface SearchProductsQuery extends OrganizationScope {
  readonly limit?: number;
  readonly query: string;
}

export interface SearchProductsResult {
  readonly evidence: CommercialEvidence;
  readonly matches: readonly CommercialProduct[];
  readonly truncated: boolean;
}

export interface GetProductQuery extends OrganizationScope {
  readonly externalProductId: string;
}

export type ProductLookupResult =
  | Readonly<{ kind: "found"; product: CommercialProduct }>
  | Readonly<{ evidence: CommercialEvidence; kind: "not-found" }>;

export interface GetPriceQuery extends GetProductQuery {
  readonly locationId: string;
}

interface PriceObservation {
  readonly currency: "ARS";
  readonly evidence: CommercialEvidence;
  readonly locationId: string;
  readonly unit: string;
}

export type PriceLookupResult =
  | (PriceObservation &
      Readonly<{
        amountMinor: number;
        kind: "priced";
      }>)
  | (PriceObservation &
      Readonly<{
        kind: "missing";
        reason: "discontinued" | "price-not-configured" | "product-not-found";
      }>);

export interface GetStockQuery extends GetProductQuery {
  readonly locationId: string;
}

interface StockObservation {
  readonly evidence: CommercialEvidence;
  readonly locationId: string;
  readonly unit: string;
}

export type StockLookupResult =
  | (StockObservation &
      Readonly<{
        kind: "known";
        quantity: number;
      }>)
  | (StockObservation &
      Readonly<{
        kind: "unknown";
        reason:
          | "location-not-configured"
          | "product-not-found"
          | "stock-not-reported";
      }>);

export interface GetReceiptStatusQuery extends OrganizationScope {
  readonly externalReceiptId: string;
}

export type ReceiptStatusResult =
  | Readonly<{
      confirmedAt: string;
      evidence: CommercialEvidence;
      externalReceiptId: string;
      kind: "confirmed";
    }>
  | Readonly<{
      evidence: CommercialEvidence;
      externalReceiptId: string;
      kind: "not-confirmed";
    }>
  | Readonly<{ evidence: CommercialEvidence; kind: "not-found" }>;

export interface CommercialCatalogPort {
  getPrice(query: GetPriceQuery): Promise<PriceLookupResult>;
  getProduct(query: GetProductQuery): Promise<ProductLookupResult>;
  getReceiptStatus(query: GetReceiptStatusQuery): Promise<ReceiptStatusResult>;
  getStock(query: GetStockQuery): Promise<StockLookupResult>;
  searchProducts(query: SearchProductsQuery): Promise<SearchProductsResult>;
}

export interface PromotionApproval {
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly approverRole: "Responsable de negocio";
  readonly conditions: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
  readonly evidence: CommercialEvidence;
  readonly publicationRevisionId: string;
}

export interface GetPromotionApprovalQuery extends OrganizationScope {
  readonly at: string;
  readonly publicationRevisionId: string;
}

export type PromotionApprovalResult =
  | Readonly<{ approval: PromotionApproval; kind: "approved" }>
  | Readonly<{
      kind: "not-effective";
      reason: "expired" | "not-started";
    }>
  | Readonly<{ kind: "not-found" }>;

export interface PromotionApprovalPort {
  getPromotionApproval(
    query: GetPromotionApprovalQuery,
  ): Promise<PromotionApprovalResult>;
}

export type CommercialCatalogErrorCode =
  "invalid-request" | "timeout" | "unavailable";

export class CommercialCatalogError extends Error {
  readonly code: CommercialCatalogErrorCode;
  readonly retryable: boolean;

  constructor(
    code: CommercialCatalogErrorCode,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.code = code;
    this.name = "CommercialCatalogError";
    this.retryable = retryable;
  }
}
