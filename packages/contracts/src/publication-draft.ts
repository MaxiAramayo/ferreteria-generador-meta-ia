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

export interface PublicationRevisionResponse {
  readonly approvalSnapshotId?: string;
  readonly approvedAt?: string;
  readonly content: PublicationDraftContentResponse;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdByMembershipId: string;
  readonly designDocument: DesignDocument;
  readonly id: string;
  readonly media: readonly PublicationRevisionMediaResponse[];
  readonly revisionNumber: number;
  readonly status: "approved" | "draft" | "in_review" | "superseded";
}

export interface PublicationSummaryResponse {
  readonly createdAt: string;
  readonly id: string;
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
