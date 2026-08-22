import type { OrganizationScope, PublicationRecord } from "./persistence.ts";
import type { PublicationStatus, PublicationTarget } from "./publication.ts";
import type { ReliableMutationContext } from "./reliable-operations.ts";

export const publicationDraftLimits = Object.freeze({
  captionMaximum: 2_200,
  productLabelMaximum: 160,
  productReferenceMaximum: 120,
  productsMaximum: 8,
});

export interface PublicationProductReference {
  readonly label: string;
  readonly reference: string;
}

export interface PublicationDraftContent {
  readonly caption: string;
  readonly products: readonly PublicationProductReference[];
}

export type PublicationDraftValidationErrorCode =
  | "caption-invalid"
  | "duplicate-product"
  | "product-label-invalid"
  | "product-reference-invalid"
  | "too-many-products";

export class PublicationDraftValidationError extends Error {
  readonly code: PublicationDraftValidationErrorCode;
  readonly field: string;

  constructor(
    code: PublicationDraftValidationErrorCode,
    field: string,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.field = field;
    this.name = "PublicationDraftValidationError";
  }
}

function normalizedBoundedText(
  text: string,
  field: string,
  maximum: number,
  code: "caption-invalid" | "product-label-invalid",
): string {
  const normalized = text.trim();
  if (normalized.length < 1 || normalized.length > maximum) {
    throw new PublicationDraftValidationError(
      code,
      field,
      `El campo ${field} no cumple la longitud permitida.`,
    );
  }
  return normalized;
}

export function normalizePublicationDraftContent(
  content: PublicationDraftContent,
): PublicationDraftContent {
  if (content.products.length > publicationDraftLimits.productsMaximum) {
    throw new PublicationDraftValidationError(
      "too-many-products",
      "products",
      "Un borrador no puede referenciar más de ocho productos.",
    );
  }

  const seenReferences = new Set<string>();
  const products = content.products.map((product, index) => {
    const reference = product.reference.trim();
    if (
      reference.length < 1 ||
      reference.length > publicationDraftLimits.productReferenceMaximum ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(reference)
    ) {
      throw new PublicationDraftValidationError(
        "product-reference-invalid",
        `products[${String(index)}].reference`,
        "La referencia de producto no es válida.",
      );
    }
    if (seenReferences.has(reference)) {
      throw new PublicationDraftValidationError(
        "duplicate-product",
        `products[${String(index)}].reference`,
        "La referencia de producto está duplicada.",
      );
    }
    seenReferences.add(reference);

    return Object.freeze({
      label: normalizedBoundedText(
        product.label,
        `products[${String(index)}].label`,
        publicationDraftLimits.productLabelMaximum,
        "product-label-invalid",
      ),
      reference,
    });
  });

  return Object.freeze({
    caption: normalizedBoundedText(
      content.caption,
      "caption",
      publicationDraftLimits.captionMaximum,
      "caption-invalid",
    ),
    products: Object.freeze(products),
  });
}

export type PublicationRevisionStatus =
  "approved" | "draft" | "in_review" | "superseded";

export interface PublicationRevisionMediaRecord {
  readonly alt: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: string;
  readonly secureUrl: string;
  readonly slot: string;
  readonly storageVersion: number;
  readonly width: number;
}

export interface PublicationRenderedMediaRecord {
  readonly byteSize: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: string;
  readonly renderedAt: string;
  readonly secureUrl: string;
  readonly storageVersion: number;
  readonly width: number;
}

export interface PublicationRevisionRecord {
  readonly approvalSnapshotId?: string;
  readonly approvedAt?: string;
  readonly content: unknown;
  /** Ejecución del brief que originó la revisión, si no la escribió una persona. */
  readonly contentBriefRunId?: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdByMembershipId: string;
  readonly designDocument: unknown;
  readonly id: string;
  readonly media: readonly PublicationRevisionMediaRecord[];
  /** Destinos exactos fijados por la aprobación, cuando existe esa política. */
  readonly publishingTargets?: readonly PublicationTarget[];
  readonly renderedMedia?: PublicationRenderedMediaRecord;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly revisionNumber: number;
  readonly schemaVersion: number;
  readonly status: PublicationRevisionStatus;
}

export interface PublicationDraftDetailRecord {
  readonly latestRevision: PublicationRevisionRecord;
  readonly publication: PublicationRecord;
}

export interface PublicationDraftListItemRecord extends PublicationRecord {
  /** Permite llegar desde el listado hasta la ejecución que generó la pieza. */
  readonly latestContentBriefRunId?: string;
  readonly latestContentHash: string;
  readonly latestRevisionId: string;
  readonly latestRevisionNumber: number;
}

export interface PaginatedRecords<RecordType> {
  readonly items: readonly RecordType[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
}

export interface PublicationDraftListFilter extends OrganizationScope {
  readonly limit: number;
  readonly locationId?: string;
  readonly page: number;
  readonly status?: PublicationStatus;
}

export interface PublicationRevisionListFilter extends OrganizationScope {
  readonly limit: number;
  readonly page: number;
  readonly publicationId: string;
}

export interface DraftMediaReferenceInput {
  readonly alt: string;
  readonly mediaAssetId: string;
  readonly slot: string;
}

export interface PersistPublicationDraftInput extends OrganizationScope {
  readonly content: PublicationDraftContent;
  /**
   * Sólo lo trae la aceptación de un brief. La clave es compuesta por
   * organización, así que una ejecución ajena no puede citarse ni por error.
   */
  readonly contentBriefRunId?: string;
  readonly contentHash: string;
  readonly createdByMembershipId: string;
  readonly designDocument: unknown;
  readonly locationId?: string;
  readonly media: readonly DraftMediaReferenceInput[];
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
  readonly revisionId: string;
  readonly schemaVersion: number;
  readonly title: string;
}

export interface PersistPublicationDraftUpdateInput extends PersistPublicationDraftInput {
  readonly expectedVersion: number;
}

export type PublicationDraftCreateResult =
  | Readonly<{
      detail: PublicationDraftDetailRecord;
      replayed?: true;
      status: "created";
    }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-reference" }>
  | Readonly<{ status: "not-found" }>;

export type PublicationDraftUpdateResult =
  | Readonly<{
      detail: PublicationDraftDetailRecord;
      replayed?: true;
      status: "updated";
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-reference" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationDraftRepository {
  create(
    input: PersistPublicationDraftInput,
  ): Promise<PublicationDraftCreateResult>;
  findById(
    scope: OrganizationScope,
    publicationId: string,
  ): Promise<PublicationDraftDetailRecord | null>;
  list(
    filter: PublicationDraftListFilter,
  ): Promise<PaginatedRecords<PublicationDraftListItemRecord>>;
  listRevisions(
    filter: PublicationRevisionListFilter,
  ): Promise<PaginatedRecords<PublicationRevisionRecord>>;
  update(
    input: PersistPublicationDraftUpdateInput,
  ): Promise<PublicationDraftUpdateResult>;
}
