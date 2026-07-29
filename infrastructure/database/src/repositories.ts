import type {
  ApprovalSnapshotRecord,
  ApprovalSnapshotRepository,
  AuthenticatedSessionRecord,
  AuthenticationEventInput,
  ChangeMembershipRolesInput,
  CreateAuthenticationSessionInput,
  IdentityRepository,
  LoginFailureFilter,
  LoginIdentityRecord,
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
  RevokeAllSessionsInput,
  RevokeMembershipInput,
  RevokeSessionInput,
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
