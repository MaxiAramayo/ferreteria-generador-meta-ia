import { randomUUID } from "node:crypto";

import type {
  ApprovalSnapshotRecord,
  ApprovalSnapshotRepository,
  AuthenticatedSessionRecord,
  AuthenticationEventInput,
  BeginMediaDeletionInput,
  BeginMediaDeletionResult,
  ChangeMembershipRolesInput,
  CompleteMediaDeletionInput,
  CompleteMediaUploadInput,
  CreateAuthenticationSessionInput,
  FailMediaUploadInput,
  IdentityRepository,
  LoginFailureFilter,
  LoginIdentityRecord,
  MediaAssetRecord,
  MediaAssetRepository,
  MediaStateMutationResult,
  MediaUploadReservation,
  OrganizationScope,
  PublicationListFilter,
  PublicationRecord,
  PublicationRepository,
  PublicationStateCommitResult,
  PublicationStateRepository,
  PublicationTransitionEvent,
  PublicationWorkflowState,
  RevokeAllSessionsInput,
  RevokeMembershipInput,
  RevokeSessionInput,
  ReserveMediaUploadInput,
  ScopedMutationResult,
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
  deletedAt: true,
  failureCode: true,
  failureMessage: true,
  height: true,
  id: true,
  mimeType: true,
  organizationId: true,
  origin: true,
  originalFileName: true,
  ownerMembershipId: true,
  retentionUntil: true,
  secureUrl: true,
  status: true,
  storageKey: true,
  storageProvider: true,
  storageVersion: true,
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

const loginIdentitySelection = {
  displayName: true,
  email: true,
  id: true,
  memberships: {
    orderBy: [{ organizationId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      organization: {
        select: {
          slug: true,
        },
      },
      organizationId: true,
      roles: true,
      status: true,
    },
  },
  passwordHash: true,
  passwordHashVersion: true,
  status: true,
} satisfies Prisma.UserSelect;

const authenticatedSessionSelection = {
  createdAt: true,
  csrfTokenHash: true,
  expiresAt: true,
  id: true,
  membership: {
    select: {
      id: true,
      organizationId: true,
      roles: true,
      user: {
        select: {
          displayName: true,
          email: true,
          id: true,
          passwordChangedAt: true,
        },
      },
    },
  },
} satisfies Prisma.AuthenticationSessionSelect;

type LoginIdentityRow = Prisma.UserGetPayload<{
  select: typeof loginIdentitySelection;
}>;
type AuthenticatedSessionRow = Prisma.AuthenticationSessionGetPayload<{
  select: typeof authenticatedSessionSelection;
}>;

function mapLoginIdentity(row: LoginIdentityRow): LoginIdentityRecord {
  return Object.freeze({
    displayName: row.displayName,
    email: row.email,
    id: row.id,
    memberships: Object.freeze(
      row.memberships.map((membership) =>
        Object.freeze({
          id: membership.id,
          organizationId: membership.organizationId,
          organizationSlug: membership.organization.slug,
          roles: Object.freeze([...membership.roles]),
          status: membership.status,
        }),
      ),
    ),
    ...(row.passwordHash === null ? {} : { passwordHash: row.passwordHash }),
    ...(row.passwordHashVersion === null
      ? {}
      : { passwordHashVersion: row.passwordHashVersion }),
    status: row.status,
  });
}

function mapAuthenticatedSession(
  row: AuthenticatedSessionRow,
): AuthenticatedSessionRecord {
  return Object.freeze({
    actor: Object.freeze({
      displayName: row.membership.user.displayName,
      email: row.membership.user.email,
      membershipId: row.membership.id,
      organizationId: row.membership.organizationId,
      roles: Object.freeze([...row.membership.roles]),
      sessionId: row.id,
      userId: row.membership.user.id,
    }),
    csrfTokenHash: row.csrfTokenHash,
    expiresAt: row.expiresAt.toISOString(),
  });
}

function authenticationEventData(
  event: AuthenticationEventInput,
): Prisma.AuthenticationEventUncheckedCreateInput {
  return {
    actorMembershipId: event.actorMembershipId ?? null,
    clientFingerprintHash: event.clientFingerprintHash ?? null,
    eventType: event.eventType,
    metadata: { ...event.metadata },
    occurredAt: new Date(event.occurredAt),
    organizationId: event.organizationId ?? null,
    subjectHash: event.subjectHash ?? null,
    succeeded: event.succeeded,
    targetMembershipId: event.targetMembershipId ?? null,
    userId: event.userId ?? null,
  };
}

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
    ...(row.deletedAt === null
      ? {}
      : { deletedAt: row.deletedAt.toISOString() }),
    ...(row.failureCode === null ? {} : { failureCode: row.failureCode }),
    ...(row.failureMessage === null
      ? {}
      : { failureMessage: row.failureMessage }),
    ...(row.height === null ? {} : { height: row.height }),
    id: row.id,
    ...(row.mimeType === null ? {} : { mimeType: row.mimeType }),
    organizationId: row.organizationId,
    origin: row.origin,
    originalFileName: row.originalFileName,
    ownerMembershipId: row.ownerMembershipId,
    ...(row.retentionUntil === null
      ? {}
      : { retentionUntil: row.retentionUntil.toISOString() }),
    ...(row.secureUrl === null ? {} : { secureUrl: row.secureUrl }),
    status: row.status,
    ...(row.storageKey === null ? {} : { storageKey: row.storageKey }),
    storageProvider: row.storageProvider,
    ...(row.storageVersion === null
      ? {}
      : { storageVersion: row.storageVersion }),
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

export class PrismaIdentityRepository implements IdentityRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async findLoginIdentity(email: string): Promise<LoginIdentityRecord | null> {
    const identity = await this.#database.user.findUnique({
      select: loginIdentitySelection,
      where: { email },
    });

    return identity === null ? null : mapLoginIdentity(identity);
  }

  async countRecentLoginFailures(filter: LoginFailureFilter): Promise<number> {
    return this.#database.authenticationEvent.count({
      where: {
        clientFingerprintHash: filter.clientFingerprintHash,
        eventType: "login_failed",
        occurredAt: {
          gte: new Date(filter.since),
        },
        subjectHash: filter.subjectHash,
      },
    });
  }

  async createSession(
    input: CreateAuthenticationSessionInput,
  ): Promise<AuthenticatedSessionRecord> {
    return this.#database.$transaction(async (transaction) => {
      const session = await transaction.authenticationSession.create({
        data: {
          clientFingerprintHash: input.clientFingerprintHash ?? null,
          createdAt: new Date(input.event.occurredAt),
          csrfTokenHash: input.csrfTokenHash,
          expiresAt: new Date(input.expiresAt),
          lastSeenAt: new Date(input.event.occurredAt),
          membershipId: input.membershipId,
          organizationId: input.organizationId,
          tokenHash: input.tokenHash,
          updatedAt: new Date(input.event.occurredAt),
          userId: input.userId,
        },
        select: authenticatedSessionSelection,
      });
      await transaction.authenticationEvent.create({
        data: authenticationEventData(input.event),
      });

      return mapAuthenticatedSession(session);
    });
  }

  async findSessionByTokenHash(
    tokenHash: string,
    at: string,
  ): Promise<AuthenticatedSessionRecord | null> {
    const session = await this.#database.authenticationSession.findFirst({
      select: authenticatedSessionSelection,
      where: {
        expiresAt: { gt: new Date(at) },
        membership: {
          status: "active",
        },
        revokedAt: null,
        tokenHash,
        user: {
          status: "active",
        },
      },
    });

    if (
      session === null ||
      (session.membership.user.passwordChangedAt !== null &&
        session.membership.user.passwordChangedAt > session.createdAt)
    ) {
      return null;
    }

    return mapAuthenticatedSession(session);
  }

  async recordAuthenticationEvent(
    event: AuthenticationEventInput,
  ): Promise<void> {
    await this.#database.authenticationEvent.create({
      data: authenticationEventData(event),
    });
  }

  async replaceSessionCsrfHash(
    sessionId: string,
    userId: string,
    csrfTokenHash: string,
  ): Promise<boolean> {
    const updated = await this.#database.authenticationSession.updateMany({
      data: {
        csrfTokenHash,
        lastSeenAt: new Date(),
      },
      where: {
        id: sessionId,
        revokedAt: null,
        userId,
      },
    });
    return updated.count === 1;
  }

  async revokeSession(input: RevokeSessionInput): Promise<boolean> {
    return this.#database.$transaction(async (transaction) => {
      const revoked = await transaction.authenticationSession.updateMany({
        data: {
          revokeReason: input.reason,
          revokedAt: new Date(input.revokedAt),
        },
        where: {
          id: input.sessionId,
          revokedAt: null,
          userId: input.userId,
        },
      });
      if (revoked.count === 0) {
        return false;
      }

      await transaction.authenticationEvent.create({
        data: authenticationEventData(input.event),
      });
      return true;
    });
  }

  async revokeAllSessions(input: RevokeAllSessionsInput): Promise<number> {
    return this.#database.$transaction(async (transaction) => {
      const revoked = await transaction.authenticationSession.updateMany({
        data: {
          revokeReason: input.reason,
          revokedAt: new Date(input.revokedAt),
        },
        where: {
          ...(input.exceptSessionId === undefined
            ? {}
            : { id: { not: input.exceptSessionId } }),
          revokedAt: null,
          userId: input.userId,
        },
      });
      await transaction.authenticationEvent.create({
        data: authenticationEventData({
          ...input.event,
          metadata: {
            ...input.event.metadata,
            revokedCount: revoked.count,
          },
        }),
      });

      return revoked.count;
    });
  }

  async changeMembershipRoles(
    input: ChangeMembershipRolesInput,
  ): Promise<ScopedMutationResult> {
    return this.#database.$transaction(async (transaction) => {
      const updated = await transaction.organizationMembership.updateMany({
        data: {
          roles: [...input.roles],
        },
        where: {
          id: input.targetMembershipId,
          organizationId: input.organizationId,
          status: "active",
        },
      });
      if (updated.count === 0) {
        return Object.freeze({ status: "not-found" });
      }

      await transaction.authenticationEvent.create({
        data: authenticationEventData({
          actorMembershipId: input.actorMembershipId,
          eventType: "membership_roles_changed",
          metadata: {
            roles: input.roles.join(","),
          },
          occurredAt: input.changedAt,
          organizationId: input.organizationId,
          succeeded: true,
          targetMembershipId: input.targetMembershipId,
        }),
      });
      return Object.freeze({ status: "updated" });
    });
  }

  async revokeMembership(
    input: RevokeMembershipInput,
  ): Promise<ScopedMutationResult> {
    return this.#database.$transaction(async (transaction) => {
      const revoked = await transaction.organizationMembership.updateMany({
        data: {
          status: "revoked",
        },
        where: {
          id: input.targetMembershipId,
          organizationId: input.organizationId,
          status: "active",
        },
      });
      if (revoked.count === 0) {
        return Object.freeze({ status: "not-found" });
      }

      const sessions = await transaction.authenticationSession.updateMany({
        data: {
          revokeReason: input.reason,
          revokedAt: new Date(input.revokedAt),
        },
        where: {
          membershipId: input.targetMembershipId,
          organizationId: input.organizationId,
          revokedAt: null,
        },
      });
      await transaction.authenticationEvent.create({
        data: authenticationEventData({
          actorMembershipId: input.actorMembershipId,
          eventType: "membership_revoked",
          metadata: {
            reason: input.reason,
            revokedSessions: sessions.count,
          },
          occurredAt: input.revokedAt,
          organizationId: input.organizationId,
          succeeded: true,
          targetMembershipId: input.targetMembershipId,
        }),
      });
      return Object.freeze({ status: "updated" });
    });
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

  async auditRetention(input: {
    readonly at: string;
    readonly mediaAssetId: string;
    readonly organizationId: string;
    readonly outcome: "deleted" | "failed" | "skipped";
    readonly reason: string;
  }): Promise<void> {
    await this.#database.auditEvent.create({
      data: {
        actorMembershipId: null,
        entityId: input.mediaAssetId,
        entityType: "media-asset",
        id: randomUUID(),
        metadata: { reason: input.reason },
        occurredAt: new Date(input.at),
        operation: "media.retention:sweep",
        organizationId: input.organizationId,
        outcome: input.outcome === "deleted" ? "success" : "failure",
      },
    });
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

  async findAvailableByIds(
    scope: OrganizationScope,
    mediaAssetIds: readonly string[],
  ): Promise<readonly MediaAssetRecord[]> {
    if (mediaAssetIds.length === 0) {
      return Object.freeze([]);
    }
    const mediaAssets = await this.#database.mediaAsset.findMany({
      orderBy: { id: "asc" },
      select: mediaAssetSelection,
      where: {
        id: { in: [...mediaAssetIds] },
        organizationId: scope.organizationId,
        status: "available",
      },
    });

    return Object.freeze(mediaAssets.map(mapMediaAsset));
  }

  async findExpiredUnreferenced(input: {
    readonly expiredBefore: string;
    readonly limit: number;
  }): Promise<readonly { id: string; organizationId: string }[]> {
    const rows = await this.#database.mediaAsset.findMany({
      orderBy: [{ retentionUntil: "asc" }, { id: "asc" }],
      select: { id: true, organizationId: true },
      take: input.limit,
      where: {
        composedVariants: { none: {} },
        generationVariants: { none: {} },
        renderedRevisions: { none: {} },
        retentionUntil: { lte: new Date(input.expiredBefore) },
        revisions: { none: {} },
        status: "available",
      },
    });
    return Object.freeze(rows.map((row) => Object.freeze(row)));
  }

  async reserveUpload(
    input: ReserveMediaUploadInput,
  ): Promise<MediaUploadReservation> {
    return this.#database.$transaction(async (transaction) => {
      const owner = await transaction.organizationMembership.findFirst({
        select: { id: true },
        where: {
          id: input.ownerMembershipId,
          organizationId: input.organizationId,
          status: "active",
        },
      });
      if (owner === null) {
        return Object.freeze({ status: "not-found" });
      }

      const created = await transaction.mediaAsset.createMany({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          origin: input.origin,
          originalFileName: input.originalFileName,
          ownerMembershipId: input.ownerMembershipId,
          retentionUntil:
            input.retentionUntil === undefined
              ? null
              : new Date(input.retentionUntil),
          storageProvider: input.storageProvider,
        },
        skipDuplicates: true,
      });
      let asset = await transaction.mediaAsset.findFirst({
        select: mediaAssetSelection,
        where: {
          id: input.id,
          organizationId: input.organizationId,
        },
      });
      if (asset === null) {
        return Object.freeze({ status: "not-found" });
      }
      const requestedRetention =
        input.retentionUntil === undefined
          ? null
          : new Date(input.retentionUntil);
      const sameReservation =
        asset.origin === input.origin &&
        asset.originalFileName === input.originalFileName &&
        asset.ownerMembershipId === input.ownerMembershipId &&
        asset.storageProvider === input.storageProvider;
      if (
        created.count === 0 &&
        sameReservation &&
        asset.status !== "deleted" &&
        asset.status !== "pending_deletion" &&
        requestedRetention !== null &&
        (asset.retentionUntil === null ||
          requestedRetention > asset.retentionUntil)
      ) {
        asset = await transaction.mediaAsset.update({
          data: { retentionUntil: requestedRetention },
          select: mediaAssetSelection,
          where: { id: asset.id },
        });
      }
      if (created.count === 0 && asset.status === "failed" && sameReservation) {
        const reset = await transaction.mediaAsset.updateMany({
          data: {
            failureCode: null,
            failureMessage: null,
            status: "pending_upload",
          },
          where: {
            id: input.id,
            organizationId: input.organizationId,
            status: "failed",
          },
        });
        if (reset.count === 1) {
          asset = await transaction.mediaAsset.findFirstOrThrow({
            select: mediaAssetSelection,
            where: {
              id: input.id,
              organizationId: input.organizationId,
            },
          });
          return Object.freeze({
            asset: mapMediaAsset(asset),
            status: "reserved",
          });
        }
      }
      return Object.freeze({
        asset: mapMediaAsset(asset),
        status: created.count === 1 ? "reserved" : "existing",
      });
    });
  }

  async completeUpload(
    input: CompleteMediaUploadInput,
  ): Promise<MediaStateMutationResult> {
    const updated = await this.#database.mediaAsset.updateMany({
      data: {
        byteSize: BigInt(input.byteSize),
        checksumSha256: input.checksumSha256,
        failureCode: null,
        failureMessage: null,
        height: input.height,
        mimeType: input.mimeType,
        secureUrl: input.secureUrl,
        status: "available",
        storageKey: input.storageKey,
        storageVersion: input.storageVersion,
        width: input.width,
      },
      where: {
        id: input.mediaAssetId,
        organizationId: input.organizationId,
        status: "pending_upload",
      },
    });
    return this.#mediaMutationResult(
      input.organizationId,
      input.mediaAssetId,
      updated.count,
    );
  }

  async failUpload(
    input: FailMediaUploadInput,
  ): Promise<MediaStateMutationResult> {
    const updated = await this.#database.mediaAsset.updateMany({
      data: {
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        status: "failed",
      },
      where: {
        id: input.mediaAssetId,
        organizationId: input.organizationId,
        status: "pending_upload",
      },
    });
    return this.#mediaMutationResult(
      input.organizationId,
      input.mediaAssetId,
      updated.count,
    );
  }

  async beginDeletion(
    input: BeginMediaDeletionInput,
  ): Promise<BeginMediaDeletionResult> {
    return this.#database.$transaction(async (transaction) => {
      const lockedAssets = await transaction.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "media_assets"
        WHERE "organization_id" = ${input.organizationId}::uuid
          AND "id" = ${input.mediaAssetId}::uuid
        FOR UPDATE
      `;
      if (lockedAssets.length === 0) {
        return Object.freeze({ status: "not-found" });
      }

      const current = await transaction.mediaAsset.findFirst({
        select: {
          ...mediaAssetSelection,
          _count: {
            select: {
              composedVariants: true,
              generationVariants: true,
              renderedRevisions: true,
              revisions: true,
            },
          },
        },
        where: {
          id: input.mediaAssetId,
          organizationId: input.organizationId,
        },
      });
      if (current === null) {
        throw new Error("El activo bloqueado dejó de existir.");
      }
      const asset = mapMediaAsset(current);
      if (current.status === "deleted") {
        return Object.freeze({ asset, status: "already-deleted" });
      }
      if (current.status === "pending_deletion") {
        return Object.freeze({ asset, status: "ready" });
      }
      if (current.status !== "available" || current.storageKey === null) {
        return Object.freeze({ status: "invalid-state" });
      }
      if (
        current._count.revisions > 0 ||
        current._count.renderedRevisions > 0 ||
        current._count.generationVariants > 0 ||
        current._count.composedVariants > 0
      ) {
        return Object.freeze({ status: "in-use" });
      }
      const requestedAt = new Date(input.requestedAt);
      if (
        current.retentionUntil !== null &&
        current.retentionUntil > requestedAt
      ) {
        return Object.freeze({
          retentionUntil: current.retentionUntil.toISOString(),
          status: "retained",
        });
      }

      const marked = await transaction.mediaAsset.updateMany({
        data: { status: "pending_deletion" },
        where: {
          id: input.mediaAssetId,
          organizationId: input.organizationId,
          status: "available",
        },
      });
      if (marked.count !== 1) {
        return Object.freeze({ status: "invalid-state" });
      }
      const pending = await transaction.mediaAsset.findFirstOrThrow({
        select: mediaAssetSelection,
        where: {
          id: input.mediaAssetId,
          organizationId: input.organizationId,
        },
      });
      return Object.freeze({
        asset: mapMediaAsset(pending),
        status: "ready",
      });
    });
  }

  async completeDeletion(
    input: CompleteMediaDeletionInput,
  ): Promise<MediaStateMutationResult> {
    const updated = await this.#database.mediaAsset.updateMany({
      data: {
        deletedAt: new Date(input.deletedAt),
        status: "deleted",
      },
      where: {
        id: input.mediaAssetId,
        organizationId: input.organizationId,
        status: "pending_deletion",
      },
    });
    return this.#mediaMutationResult(
      input.organizationId,
      input.mediaAssetId,
      updated.count,
    );
  }

  async #mediaMutationResult(
    organizationId: string,
    mediaAssetId: string,
    updatedCount: number,
  ): Promise<MediaStateMutationResult> {
    const asset = await this.findById({ organizationId }, mediaAssetId);
    if (asset === null) {
      return Object.freeze({ status: "not-found" });
    }
    return updatedCount === 1
      ? Object.freeze({ asset, status: "updated" })
      : Object.freeze({ status: "conflict" });
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
