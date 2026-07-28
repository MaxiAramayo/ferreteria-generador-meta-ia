import type {
  ApprovalSnapshotRecord,
  ApprovalSnapshotRepository,
  MediaAssetRecord,
  MediaAssetRepository,
  OrganizationScope,
  PublicationListFilter,
  PublicationRecord,
  PublicationRepository,
  PublicationStateCommitResult,
  PublicationStateRepository,
  PublicationTransitionEvent,
  PublicationWorkflowState,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type { Prisma } from "./generated/prisma/client.ts";

const publicationSelection = {
  createdAt: true,
  id: true,
  locationId: true,
  organizationId: true,
  scheduledFor: true,
  status: true,
  title: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.PublicationSelect;

const approvalSnapshotSelection = {
  approvedAt: true,
  approvedByMembershipId: true,
  contentHash: true,
  id: true,
  organizationId: true,
  publicationId: true,
  revisionId: true,
  snapshot: true,
} satisfies Prisma.ApprovalSnapshotSelect;

const mediaAssetSelection = {
  byteSize: true,
  checksumSha256: true,
  createdAt: true,
  height: true,
  id: true,
  mimeType: true,
  organizationId: true,
  secureUrl: true,
  status: true,
  updatedAt: true,
  width: true,
} satisfies Prisma.MediaAssetSelect;

const publicationWorkflowSelection = {
  approvalSnapshots: {
    orderBy: [{ approvedAt: "desc" }, { id: "asc" }],
    select: {
      approvedAt: true,
      approvedByMembershipId: true,
      id: true,
    },
    take: 1,
  },
  failureCode: true,
  failureMessage: true,
  failureOccurredAt: true,
  failureRetryable: true,
  id: true,
  organizationId: true,
  status: true,
  version: true,
} satisfies Prisma.PublicationSelect;

type PublicationRow = Prisma.PublicationGetPayload<{
  select: typeof publicationSelection;
}>;
type ApprovalSnapshotRow = Prisma.ApprovalSnapshotGetPayload<{
  select: typeof approvalSnapshotSelection;
}>;
type MediaAssetRow = Prisma.MediaAssetGetPayload<{
  select: typeof mediaAssetSelection;
}>;
type PublicationWorkflowRow = Prisma.PublicationGetPayload<{
  select: typeof publicationWorkflowSelection;
}>;

function mapPublication(row: PublicationRow): PublicationRecord {
  return Object.freeze({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    ...(row.locationId === null ? {} : { locationId: row.locationId }),
    organizationId: row.organizationId,
    ...(row.scheduledFor === null
      ? {}
      : { scheduledFor: row.scheduledFor.toISOString() }),
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  });
}

function mapApprovalSnapshot(row: ApprovalSnapshotRow): ApprovalSnapshotRecord {
  return Object.freeze({
    approvedAt: row.approvedAt.toISOString(),
    approvedByMembershipId: row.approvedByMembershipId,
    contentHash: row.contentHash,
    id: row.id,
    organizationId: row.organizationId,
    publicationId: row.publicationId,
    revisionId: row.revisionId,
    snapshot: row.snapshot,
  });
}

function mapMediaAsset(row: MediaAssetRow): MediaAssetRecord {
  return Object.freeze({
    ...(row.byteSize === null ? {} : { byteSize: row.byteSize.toString() }),
    ...(row.checksumSha256 === null
      ? {}
      : { checksumSha256: row.checksumSha256 }),
    createdAt: row.createdAt.toISOString(),
    ...(row.height === null ? {} : { height: row.height }),
    id: row.id,
    ...(row.mimeType === null ? {} : { mimeType: row.mimeType }),
    organizationId: row.organizationId,
    ...(row.secureUrl === null ? {} : { secureUrl: row.secureUrl }),
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    ...(row.width === null ? {} : { width: row.width }),
  });
}

function mapPublicationWorkflow(
  row: PublicationWorkflowRow,
): PublicationWorkflowState {
  const approvalSnapshot = row.approvalSnapshots[0];
  const approvalIsCurrent = [
    "approved",
    "partially_published",
    "publish_failed",
    "published",
    "publishing",
    "scheduled",
  ].includes(row.status);
  const failure =
    row.failureCode === null ||
    row.failureMessage === null ||
    row.failureOccurredAt === null ||
    row.failureRetryable === null
      ? undefined
      : Object.freeze({
          code: row.failureCode,
          failedAt: row.failureOccurredAt.toISOString(),
          retryable: row.failureRetryable,
          safeMessage: row.failureMessage,
        });
  const approval =
    !approvalIsCurrent || approvalSnapshot === undefined
      ? undefined
      : Object.freeze({
          approvedAt: approvalSnapshot.approvedAt.toISOString(),
          reviewerMembershipId: approvalSnapshot.approvedByMembershipId,
          snapshotId: approvalSnapshot.id,
        });

  return Object.freeze({
    ...(approval === undefined ? {} : { approval }),
    ...(failure === undefined ? {} : { failure }),
    id: row.id,
    organizationId: row.organizationId,
    status: row.status,
    version: row.version,
  });
}

export class PrismaPublicationRepository implements PublicationRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async findById(
    scope: OrganizationScope,
    publicationId: string,
  ): Promise<PublicationRecord | null> {
    const publication = await this.#database.publication.findFirst({
      select: publicationSelection,
      where: {
        id: publicationId,
        organizationId: scope.organizationId,
      },
    });

    return publication === null ? null : mapPublication(publication);
  }

  async list(
    filter: PublicationListFilter,
  ): Promise<readonly PublicationRecord[]> {
    if (
      !Number.isInteger(filter.limit) ||
      filter.limit < 1 ||
      filter.limit > 100
    ) {
      throw new RangeError("Publication list limit must be between 1 and 100.");
    }
    if (
      filter.scheduledFrom !== undefined &&
      filter.scheduledUntil !== undefined &&
      filter.scheduledFrom > filter.scheduledUntil
    ) {
      throw new RangeError(
        "Publication schedule range must start before it ends.",
      );
    }

    const scheduledFor =
      filter.scheduledFrom === undefined && filter.scheduledUntil === undefined
        ? undefined
        : {
            ...(filter.scheduledFrom === undefined
              ? {}
              : { gte: filter.scheduledFrom }),
            ...(filter.scheduledUntil === undefined
              ? {}
              : { lte: filter.scheduledUntil }),
          };
    const where = {
      organizationId: filter.organizationId,
      ...(scheduledFor === undefined ? {} : { scheduledFor }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
    } satisfies Prisma.PublicationWhereInput;

    const publications = await this.#database.publication.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: publicationSelection,
      take: filter.limit,
      where,
    });

    return Object.freeze(publications.map(mapPublication));
  }
}

export class PrismaApprovalSnapshotRepository implements ApprovalSnapshotRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async findLatestByPublicationId(
    scope: OrganizationScope,
    publicationId: string,
  ): Promise<ApprovalSnapshotRecord | null> {
    const snapshot = await this.#database.approvalSnapshot.findFirst({
      orderBy: [{ approvedAt: "desc" }, { id: "asc" }],
      select: approvalSnapshotSelection,
      where: {
        organizationId: scope.organizationId,
        publicationId,
      },
    });

    return snapshot === null ? null : mapApprovalSnapshot(snapshot);
  }
}

export class PrismaMediaAssetRepository implements MediaAssetRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async findById(
    scope: OrganizationScope,
    mediaAssetId: string,
  ): Promise<MediaAssetRecord | null> {
    const mediaAsset = await this.#database.mediaAsset.findFirst({
      select: mediaAssetSelection,
      where: {
        id: mediaAssetId,
        organizationId: scope.organizationId,
      },
    });

    return mediaAsset === null ? null : mapMediaAsset(mediaAsset);
  }
}

export class PrismaPublicationStateRepository implements PublicationStateRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async findById(
    organizationId: string,
    publicationId: string,
  ): Promise<PublicationWorkflowState | null> {
    const publication = await this.#database.publication.findFirst({
      select: publicationWorkflowSelection,
      where: {
        id: publicationId,
        organizationId,
      },
    });

    return publication === null ? null : mapPublicationWorkflow(publication);
  }

  async commit(
    state: PublicationWorkflowState,
    event: PublicationTransitionEvent,
  ): Promise<PublicationStateCommitResult> {
    return this.#database.$transaction(async (transaction) => {
      const update = await transaction.publication.updateMany({
        data: {
          failureCode: state.failure?.code ?? null,
          failureMessage: state.failure?.safeMessage ?? null,
          failureOccurredAt:
            state.failure === undefined
              ? null
              : new Date(state.failure.failedAt),
          failureRetryable: state.failure?.retryable ?? null,
          status: state.status,
          version: state.version,
        },
        where: {
          id: event.publicationId,
          organizationId: event.organizationId,
          status: event.fromStatus,
          version: event.fromVersion,
        },
      });

      if (update.count !== 1) {
        return Object.freeze({ status: "version-conflict" });
      }

      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: event.actorMembershipId,
          approvalSnapshotId: event.approval?.snapshotId ?? null,
          commandType: event.commandType,
          failureCode: event.failure?.code ?? null,
          failureMessage: event.failure?.safeMessage ?? null,
          failureRetryable: event.failure?.retryable ?? null,
          fromStatus: event.fromStatus,
          fromVersion: event.fromVersion,
          newRevisionId: event.newRevisionId ?? null,
          occurredAt: new Date(event.occurredAt),
          organizationId: event.organizationId,
          publicationId: event.publicationId,
          reasonCode: event.reasonCode ?? null,
          toStatus: event.toStatus,
          toVersion: event.toVersion,
        },
      });

      return Object.freeze({ status: "committed" });
    });
  }
}
