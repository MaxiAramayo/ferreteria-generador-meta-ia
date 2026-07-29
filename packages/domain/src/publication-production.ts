import type { ReliableMutationContext } from "./reliable-operations.ts";

export const publicationRenderTopic = "content.publication.render-requested";

export interface PublicationRenderRequestInput {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
}

export type PublicationRenderRequestResult =
  | Readonly<{
      publicationId: string;
      revisionId: string;
      replayed?: true;
      status: "accepted";
      version: number;
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationRenderJob {
  readonly alreadyCompleted: boolean;
  readonly actorMembershipId: string;
  readonly designDocument: unknown;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly publicationVersion: number;
  readonly revisionId: string;
}

export interface PublicationRenderOutput {
  readonly byteSize: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: "image/png";
  readonly renderedAt: string;
  readonly secureUrl: string;
  readonly storageVersion: number;
  readonly width: number;
}

export type PublicationRenderCompletionResult =
  | Readonly<{ status: "completed"; version: number }>
  | Readonly<{ status: "already-completed"; version: number }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationRenderFailureInput {
  readonly actorMembershipId: string;
  readonly code: string;
  readonly failedAt: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly publicationVersion: number;
  readonly retryable: boolean;
  readonly safeMessage: string;
}

export interface ApprovePublicationInput {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
}

export type ApprovePublicationResult =
  | Readonly<{
      publicationId: string;
      replayed?: true;
      snapshotId: string;
      status: "approved";
      version: number;
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationProductionRepository {
  approve(input: ApprovePublicationInput): Promise<ApprovePublicationResult>;
  completeRender(
    job: PublicationRenderJob,
    output: PublicationRenderOutput,
  ): Promise<PublicationRenderCompletionResult>;
  failRender(
    input: PublicationRenderFailureInput,
  ): Promise<PublicationRenderCompletionResult>;
  findRenderJob(
    organizationId: string,
    publicationId: string,
    revisionId: string,
  ): Promise<PublicationRenderJob | null>;
  requestRender(
    input: PublicationRenderRequestInput,
  ): Promise<PublicationRenderRequestResult>;
}
