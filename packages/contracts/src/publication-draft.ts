import type { DesignDocument } from "@aramayo/design-engine";

export type PublicationStatusResponse =
  | "approved"
  | "cancelled"
  | "draft"
  | "expired"
  | "generating_assets"
  | "generation_failed"
  | "missing_information"
  | "partially_published"
  | "published"
  | "publishing"
  | "publish_failed"
  | "ready_for_review"
  | "retrieving_context"
  | "scheduled"
  | "validation_failed";

export interface PublicationProductReferenceResponse {
  readonly label: string;
  readonly reference: string;
}

export interface PublicationDraftContentResponse {
  readonly caption: string;
  readonly products: readonly PublicationProductReferenceResponse[];
}

export interface PublicationRevisionMediaResponse {
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

export interface PublicationRenderedMediaResponse {
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

export interface PublicationRevisionResponse {
  readonly approvalSnapshotId?: string;
  readonly approvedAt?: string;
  readonly content: PublicationDraftContentResponse;
  /**
   * Ejecución del brief que originó la revisión. Ausente cuando la escribió
   * una persona: cada revisión declara su propio origen, así que editar un
   * borrador generado produce una revisión que ya no cita ninguna ejecución.
   */
  readonly contentBriefRunId?: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdByMembershipId: string;
  readonly designDocument: DesignDocument;
  readonly id: string;
  readonly media: readonly PublicationRevisionMediaResponse[];
  readonly renderedMedia?: PublicationRenderedMediaResponse;
  readonly revisionNumber: number;
  readonly status: "approved" | "draft" | "in_review" | "superseded";
}

export interface PublicationSummaryResponse {
  readonly createdAt: string;
  readonly failure?: Readonly<{
    readonly code: string;
    readonly occurredAt: string;
    readonly retryable: boolean;
    readonly safeMessage: string;
  }>;
  readonly id: string;
  /** Ejecución del brief que originó la última revisión, si la hubo. */
  readonly latestContentBriefRunId?: string;
  readonly latestContentHash: string;
  readonly latestRevisionId: string;
  readonly latestRevisionNumber: number;
  readonly locationId?: string;
  readonly status: PublicationStatusResponse;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PublicationDraftResponse {
  readonly createdAt: string;
  readonly failure?: PublicationSummaryResponse["failure"];
  readonly id: string;
  readonly latestRevision: PublicationRevisionResponse;
  readonly locationId?: string;
  readonly status: PublicationStatusResponse;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PaginatedResponse<RecordType> {
  readonly items: readonly RecordType[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
}

export type PublicationListResponse =
  PaginatedResponse<PublicationSummaryResponse>;

export type PublicationRevisionListResponse =
  PaginatedResponse<PublicationRevisionResponse>;

export interface PublicationRenderRequestResponse {
  readonly publicationId: string;
  readonly revisionId: string;
  readonly status: "generating_assets";
  readonly version: number;
}

export interface PublicationApprovalResponse {
  readonly publicationId: string;
  readonly snapshotId: string;
  readonly status: "approved";
  readonly version: number;
}
