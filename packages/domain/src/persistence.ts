import type { PublicationStatus } from "./publication.ts";

export interface OrganizationScope {
  readonly organizationId: string;
}

export interface PublicationListFilter extends OrganizationScope {
  readonly limit: number;
  readonly scheduledFrom?: Date;
  readonly scheduledUntil?: Date;
  readonly status?: PublicationStatus;
}

export interface PublicationRecord {
  readonly createdAt: string;
  readonly failure?: Readonly<{
    readonly code: string;
    readonly occurredAt: string;
    readonly retryable: boolean;
    readonly safeMessage: string;
  }>;
  readonly id: string;
  readonly locationId?: string;
  readonly organizationId: string;
  readonly scheduledFor?: string;
  readonly status: PublicationStatus;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PublicationRepository {
  findById(
    scope: OrganizationScope,
    publicationId: string,
  ): Promise<PublicationRecord | null>;
  list(filter: PublicationListFilter): Promise<readonly PublicationRecord[]>;
}

export interface ApprovalSnapshotRecord {
  readonly approvedAt: string;
  readonly approvedByMembershipId: string;
  readonly contentHash: string;
  readonly id: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly revisionId: string;
  readonly snapshot: unknown;
}

export interface ApprovalSnapshotRepository {
  findLatestByPublicationId(
    scope: OrganizationScope,
    publicationId: string,
  ): Promise<ApprovalSnapshotRecord | null>;
}
