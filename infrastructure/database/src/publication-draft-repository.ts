import { PUBLICATION_STATUSES } from "@aramayo/domain";
import type {
  PaginatedRecords,
  PersistPublicationDraftInput,
  PersistPublicationDraftUpdateInput,
  PublicationDraftCreateResult,
  PublicationDraftDetailRecord,
  PublicationDraftListFilter,
  PublicationDraftListItemRecord,
  PublicationDraftRepository,
  PublicationDraftUpdateResult,
  PublicationRecord,
  PublicationRevisionListFilter,
  PublicationRevisionMediaRecord,
  PublicationRevisionRecord,
  SafeJsonObject,
  SafeJsonValue,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";
import {
  claimReliableOperation,
  commitReliableOperation,
  discardReliableOperationClaim,
} from "./reliable-operation-repository.ts";

const publicationFields = {
  createdAt: true,
  failureCode: true,
  failureMessage: true,
  failureOccurredAt: true,
  failureRetryable: true,
  id: true,
  locationId: true,
  organizationId: true,
  scheduledFor: true,
  status: true,
  title: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.PublicationSelect;

const revisionFields = {
  approvalSnapshot: {
    select: {
      approvedAt: true,
      id: true,
    },
  },
  content: true,
  contentBriefRunId: true,
  contentHash: true,
  createdAt: true,
  createdByMembershipId: true,
  designDocument: true,
  id: true,
  media: {
    orderBy: [{ slot: "asc" }, { id: "asc" }],
    select: {
      alt: true,
      mediaAsset: {
        select: {
          checksumSha256: true,
          height: true,
          id: true,
          mimeType: true,
          secureUrl: true,
          storageVersion: true,
          width: true,
        },
      },
      slot: true,
    },
  },
  organizationId: true,
  publicationId: true,
  renderedAt: true,
  renderedMedia: {
    select: {
      byteSize: true,
      checksumSha256: true,
      height: true,
      id: true,
      mimeType: true,
      secureUrl: true,
      storageVersion: true,
      width: true,
    },
  },
  revisionNumber: true,
  schemaVersion: true,
  status: true,
} satisfies Prisma.PublicationRevisionSelect;

const publicationDetailFields = {
  ...publicationFields,
  revisions: {
    orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
    select: revisionFields,
    take: 1,
  },
} satisfies Prisma.PublicationSelect;

type PublicationRow = Prisma.PublicationGetPayload<{
  select: typeof publicationFields;
}>;
type RevisionRow = Prisma.PublicationRevisionGetPayload<{
  select: typeof revisionFields;
}>;
type PublicationDetailRow = Prisma.PublicationGetPayload<{
  select: typeof publicationDetailFields;
}>;

function mapPublication(row: PublicationRow): PublicationRecord {
  const failure =
    row.failureCode === null ||
    row.failureMessage === null ||
    row.failureOccurredAt === null ||
    row.failureRetryable === null
      ? undefined
      : Object.freeze({
          code: row.failureCode,
          occurredAt: row.failureOccurredAt.toISOString(),
          retryable: row.failureRetryable,
          safeMessage: row.failureMessage,
        });
  return Object.freeze({
    createdAt: row.createdAt.toISOString(),
    ...(failure === undefined ? {} : { failure }),
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

function mapRevisionMedia(
  media: RevisionRow["media"][number],
): PublicationRevisionMediaRecord {
  const asset = media.mediaAsset;
  if (
    asset.checksumSha256 === null ||
    asset.height === null ||
    asset.mimeType === null ||
    asset.secureUrl === null ||
    asset.storageVersion === null ||
    asset.width === null
  ) {
    throw new Error(
      "Una revisión referencia un medio sin metadatos completos.",
    );
  }

  return Object.freeze({
    alt: media.alt,
    checksumSha256: asset.checksumSha256,
    height: asset.height,
    mediaAssetId: asset.id,
    mimeType: asset.mimeType,
    secureUrl: asset.secureUrl,
    slot: media.slot,
    storageVersion: asset.storageVersion,
    width: asset.width,
  });
}

function mapRenderedMedia(
  rendered: RevisionRow["renderedMedia"],
  renderedAt: RevisionRow["renderedAt"],
): PublicationRevisionRecord["renderedMedia"] {
  if (rendered === null && renderedAt === null) {
    return undefined;
  }
  if (
    rendered === null ||
    renderedAt === null ||
    rendered.byteSize === null ||
    rendered.checksumSha256 === null ||
    rendered.height === null ||
    rendered.mimeType === null ||
    rendered.secureUrl === null ||
    rendered.storageVersion === null ||
    rendered.width === null
  ) {
    throw new Error("La revisión conserva un render incompleto.");
  }
  return Object.freeze({
    byteSize: rendered.byteSize.toString(),
    checksumSha256: rendered.checksumSha256,
    height: rendered.height,
    mediaAssetId: rendered.id,
    mimeType: rendered.mimeType,
    renderedAt: renderedAt.toISOString(),
    secureUrl: rendered.secureUrl,
    storageVersion: rendered.storageVersion,
    width: rendered.width,
  });
}

function mapRevision(row: RevisionRow): PublicationRevisionRecord {
  const approval = row.approvalSnapshot;
  const renderedMedia = mapRenderedMedia(row.renderedMedia, row.renderedAt);
  return Object.freeze({
    ...(approval === null
      ? {}
      : {
          approvalSnapshotId: approval.id,
          approvedAt: approval.approvedAt.toISOString(),
        }),
    content: row.content,
    ...(row.contentBriefRunId === null
      ? {}
      : { contentBriefRunId: row.contentBriefRunId }),
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
    createdByMembershipId: row.createdByMembershipId,
    designDocument: row.designDocument,
    id: row.id,
    media: Object.freeze(row.media.map(mapRevisionMedia)),
    ...(renderedMedia === undefined ? {} : { renderedMedia }),
    organizationId: row.organizationId,
    publicationId: row.publicationId,
    revisionNumber: row.revisionNumber,
    schemaVersion: row.schemaVersion,
    status: row.status,
  });
}

function mapDetail(row: PublicationDetailRow): PublicationDraftDetailRecord {
  const latestRevision = row.revisions[0];
  if (latestRevision === undefined) {
    throw new Error("La publicación no conserva ninguna revisión.");
  }
  return Object.freeze({
    latestRevision: mapRevision(latestRevision),
    publication: mapPublication(row),
  });
}

function domainJsonValue(value: unknown, path: string): SafeJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry, index) =>
        domainJsonValue(entry, `${path}[${String(index)}]`),
      ),
    );
  }
  if (typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          domainJsonValue(entry, `${path}.${key}`),
        ]),
      ),
    );
  }
  throw new TypeError(`${path} no puede persistirse como JSON.`);
}

function detailResponseBody(
  detail: PublicationDraftDetailRecord,
): SafeJsonObject {
  const serialized = domainJsonValue(detail, "publicationDetail");
  if (
    typeof serialized !== "object" ||
    serialized === null ||
    isSafeJsonArray(serialized)
  ) {
    throw new TypeError("El detalle de publicación no es un objeto JSON.");
  }
  return serialized;
}

function isSafeJsonArray(
  value: SafeJsonValue,
): value is readonly SafeJsonValue[] {
  return Array.isArray(value);
}

function replayObject(value: SafeJsonValue, path: string): SafeJsonObject {
  if (typeof value !== "object" || value === null || isSafeJsonArray(value)) {
    throw new TypeError(`${path} no conserva un objeto.`);
  }
  return value;
}

function replayArray(
  value: SafeJsonValue | undefined,
  path: string,
): readonly SafeJsonValue[] {
  if (value === undefined || !isSafeJsonArray(value)) {
    throw new TypeError(`${path} no conserva una lista.`);
  }
  return value;
}

function replayString(value: SafeJsonValue | undefined, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} no conserva texto.`);
  }
  return value;
}

function replayNumber(value: SafeJsonValue | undefined, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} no conserva un número.`);
  }
  return value;
}

function replayOptionalString(
  object: SafeJsonObject,
  key: string,
  path: string,
): string | undefined {
  const value = object[key];
  return value === undefined
    ? undefined
    : replayString(value, `${path}.${key}`);
}

function isPublicationStatus(
  status: string,
): status is PublicationRecord["status"] {
  return PUBLICATION_STATUSES.some((candidate) => candidate === status);
}

function isRevisionStatus(
  status: string,
): status is PublicationRevisionRecord["status"] {
  return ["approved", "draft", "in_review", "superseded"].some(
    (candidate) => candidate === status,
  );
}

function replayDetail(
  responseBody: SafeJsonObject,
): PublicationDraftDetailRecord {
  const publication = replayObject(
    responseBody["publication"] ?? null,
    "responseBody.publication",
  );
  const revision = replayObject(
    responseBody["latestRevision"] ?? null,
    "responseBody.latestRevision",
  );
  const publicationStatus = replayString(
    publication["status"],
    "responseBody.publication.status",
  );
  if (!isPublicationStatus(publicationStatus)) {
    throw new TypeError(
      "responseBody.publication.status no conserva un estado válido.",
    );
  }
  const revisionStatus = replayString(
    revision["status"],
    "responseBody.latestRevision.status",
  );
  if (!isRevisionStatus(revisionStatus)) {
    throw new TypeError(
      "responseBody.latestRevision.status no conserva un estado válido.",
    );
  }
  const content = revision["content"];
  const designDocument = revision["designDocument"];
  if (content === undefined || designDocument === undefined) {
    throw new TypeError("La respuesta idempotente está incompleta.");
  }
  const approvalSnapshotId = replayOptionalString(
    revision,
    "approvalSnapshotId",
    "responseBody.latestRevision",
  );
  const approvedAt = replayOptionalString(
    revision,
    "approvedAt",
    "responseBody.latestRevision",
  );
  const locationId = replayOptionalString(
    publication,
    "locationId",
    "responseBody.publication",
  );
  const scheduledFor = replayOptionalString(
    publication,
    "scheduledFor",
    "responseBody.publication",
  );

  return Object.freeze({
    latestRevision: Object.freeze({
      ...(approvalSnapshotId === undefined ? {} : { approvalSnapshotId }),
      ...(approvedAt === undefined ? {} : { approvedAt }),
      content,
      contentHash: replayString(
        revision["contentHash"],
        "responseBody.latestRevision.contentHash",
      ),
      createdAt: replayString(
        revision["createdAt"],
        "responseBody.latestRevision.createdAt",
      ),
      createdByMembershipId: replayString(
        revision["createdByMembershipId"],
        "responseBody.latestRevision.createdByMembershipId",
      ),
      designDocument,
      id: replayString(revision["id"], "responseBody.latestRevision.id"),
      media: Object.freeze(
        replayArray(revision["media"], "responseBody.latestRevision.media").map(
          (entry, index) => {
            const media = replayObject(
              entry,
              `responseBody.latestRevision.media[${String(index)}]`,
            );
            const mediaPath = `responseBody.latestRevision.media[${String(index)}]`;
            return Object.freeze({
              alt: replayString(media["alt"], `${mediaPath}.alt`),
              checksumSha256: replayString(
                media["checksumSha256"],
                `${mediaPath}.checksumSha256`,
              ),
              height: replayNumber(media["height"], `${mediaPath}.height`),
              mediaAssetId: replayString(
                media["mediaAssetId"],
                `${mediaPath}.mediaAssetId`,
              ),
              mimeType: replayString(
                media["mimeType"],
                `${mediaPath}.mimeType`,
              ),
              secureUrl: replayString(
                media["secureUrl"],
                `${mediaPath}.secureUrl`,
              ),
              slot: replayString(media["slot"], `${mediaPath}.slot`),
              storageVersion: replayNumber(
                media["storageVersion"],
                `${mediaPath}.storageVersion`,
              ),
              width: replayNumber(media["width"], `${mediaPath}.width`),
            });
          },
        ),
      ),
      organizationId: replayString(
        revision["organizationId"],
        "responseBody.latestRevision.organizationId",
      ),
      publicationId: replayString(
        revision["publicationId"],
        "responseBody.latestRevision.publicationId",
      ),
      revisionNumber: replayNumber(
        revision["revisionNumber"],
        "responseBody.latestRevision.revisionNumber",
      ),
      schemaVersion: replayNumber(
        revision["schemaVersion"],
        "responseBody.latestRevision.schemaVersion",
      ),
      status: revisionStatus,
    }),
    publication: Object.freeze({
      createdAt: replayString(
        publication["createdAt"],
        "responseBody.publication.createdAt",
      ),
      id: replayString(publication["id"], "responseBody.publication.id"),
      ...(locationId === undefined ? {} : { locationId }),
      organizationId: replayString(
        publication["organizationId"],
        "responseBody.publication.organizationId",
      ),
      ...(scheduledFor === undefined ? {} : { scheduledFor }),
      status: publicationStatus,
      title: replayString(
        publication["title"],
        "responseBody.publication.title",
      ),
      updatedAt: replayString(
        publication["updatedAt"],
        "responseBody.publication.updatedAt",
      ),
      version: replayNumber(
        publication["version"],
        "responseBody.publication.version",
      ),
    }),
  });
}

function assertPagination(page: number, limit: number): void {
  if (!Number.isInteger(page) || page < 1 || page > 10_000) {
    throw new RangeError("Page must be between 1 and 10000.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Limit must be between 1 and 100.");
  }
}

function assertReliableMutationScope(
  input: PersistPublicationDraftInput,
): void {
  if (
    input.reliableOperation.claim.organizationId !== input.organizationId ||
    input.reliableOperation.claim.actorMembershipId !==
      input.createdByMembershipId
  ) {
    throw new Error(
      "La operación idempotente no coincide con el alcance del borrador.",
    );
  }
}

async function completeDraftMutation(
  transaction: Prisma.TransactionClient,
  input: PersistPublicationDraftInput,
  recordId: string,
  detail: PublicationDraftDetailRecord,
  action: "created" | "updated",
): Promise<void> {
  const revision = detail.latestRevision;
  const completed = await commitReliableOperation(transaction, {
    audit: {
      actorMembershipId: input.createdByMembershipId,
      entityId: input.publicationId,
      entityType: "publication",
      eventId: input.reliableOperation.auditEventId,
      metadata: Object.freeze({
        action,
        publicationId: input.publicationId,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        version: detail.publication.version,
      }),
      occurredAt: input.reliableOperation.occurredAt,
      operation: input.reliableOperation.claim.operation,
      organizationId: input.organizationId,
      outcome: "success",
    },
    idempotency: {
      actorMembershipId: input.createdByMembershipId,
      expiresAt: input.reliableOperation.completedExpiresAt,
      keyHash: input.reliableOperation.claim.keyHash,
      operation: input.reliableOperation.claim.operation,
      organizationId: input.organizationId,
      recordId,
      responseBody: detailResponseBody(detail),
      responseStatus: action === "created" ? 201 : 200,
    },
    outbox: [
      {
        aggregateId: input.publicationId,
        aggregateType: "publication",
        availableAt: input.reliableOperation.occurredAt,
        eventId: input.reliableOperation.outboxEventId,
        organizationId: input.organizationId,
        payload: Object.freeze({
          action,
          publicationId: input.publicationId,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          version: detail.publication.version,
        }),
        topic: `content.publication.${action}:v1`,
      },
    ],
  });
  if (!completed) {
    throw new Error(
      "No se pudo completar la operación idempotente del borrador.",
    );
  }
}

function prismaJson(value: unknown, path = "document"): Prisma.InputJsonValue {
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path} contains a non-finite number.`);
      }
      return value;
    case "object": {
      if (value === null) {
        throw new TypeError(`${path} contains a null value.`);
      }
      if (Array.isArray(value)) {
        return value.map((entry, index) =>
          prismaJson(entry, `${path}[${String(index)}]`),
        );
      }
      const entries: Array<[string, Prisma.InputJsonValue]> = [];
      for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined) {
          throw new TypeError(`${path}.${key} is undefined.`);
        }
        entries.push([key, prismaJson(entry, `${path}.${key}`)]);
      }
      return Object.fromEntries(entries);
    }
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      throw new TypeError(`${path} is not JSON serializable.`);
  }
}

function revisionData(input: PersistPublicationDraftInput): Readonly<{
  content: Prisma.InputJsonObject;
  contentBriefRunId: string | null;
  contentHash: string;
  createdByMembershipId: string;
  designDocument: Prisma.InputJsonValue;
  id: string;
  organizationId: string;
  publicationId: string;
  revisionNumber: number;
  schemaVersion: number;
}> {
  return {
    content: {
      caption: input.content.caption,
      products: input.content.products.map((product) => ({
        label: product.label,
        reference: product.reference,
      })),
    },
    contentBriefRunId: input.contentBriefRunId ?? null,
    contentHash: input.contentHash,
    createdByMembershipId: input.createdByMembershipId,
    designDocument: prismaJson(input.designDocument),
    id: input.revisionId,
    organizationId: input.organizationId,
    publicationId: input.publicationId,
    revisionNumber: 1,
    schemaVersion: input.schemaVersion,
  };
}

async function writeReferencesAreValid(
  transaction: Prisma.TransactionClient,
  input: PersistPublicationDraftInput,
): Promise<boolean> {
  const actor = await transaction.organizationMembership.findFirst({
    select: { id: true },
    where: {
      id: input.createdByMembershipId,
      organizationId: input.organizationId,
      status: "active",
    },
  });
  if (actor === null) {
    return false;
  }
  if (input.locationId !== undefined) {
    const location = await transaction.location.findFirst({
      select: { id: true },
      where: {
        id: input.locationId,
        isActive: true,
        organizationId: input.organizationId,
      },
    });
    if (location === null) {
      return false;
    }
  }

  const mediaAssetIds = input.media.map((media) => media.mediaAssetId);
  if (mediaAssetIds.length === 0) {
    return true;
  }
  const lockedMedia = await transaction.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      SELECT "id"
      FROM "media_assets"
      WHERE "organization_id" = ${input.organizationId}::uuid
        AND "status" = 'available'
        AND "id" IN (${Prisma.join(mediaAssetIds)})
      FOR SHARE
    `,
  );
  return lockedMedia.length === mediaAssetIds.length;
}

async function createRevisionMedia(
  transaction: Prisma.TransactionClient,
  input: PersistPublicationDraftInput,
): Promise<void> {
  if (input.media.length === 0) {
    return;
  }
  await transaction.publicationRevisionMedia.createMany({
    data: input.media.map((media) => ({
      alt: media.alt,
      mediaAssetId: media.mediaAssetId,
      organizationId: input.organizationId,
      revisionId: input.revisionId,
      slot: media.slot,
    })),
  });
}

async function findDetail(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  publicationId: string,
): Promise<PublicationDraftDetailRecord> {
  const detail = await transaction.publication.findFirstOrThrow({
    select: publicationDetailFields,
    where: { id: publicationId, organizationId },
  });
  return mapDetail(detail);
}

export class PrismaPublicationDraftRepository implements PublicationDraftRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async create(
    input: PersistPublicationDraftInput,
  ): Promise<PublicationDraftCreateResult> {
    return this.#database.$transaction(async (transaction) => {
      assertReliableMutationScope(input);
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "replayed":
          return Object.freeze({
            detail: replayDetail(claim.responseBody),
            replayed: true,
            status: "created",
          });
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "claimed":
          break;
      }
      if (!(await writeReferencesAreValid(transaction, input))) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-reference" });
      }
      const existing = await transaction.publication.findFirst({
        select: { id: true },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
        },
      });
      if (existing !== null) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }

      await transaction.publication.create({
        data: {
          createdByMembershipId: input.createdByMembershipId,
          id: input.publicationId,
          locationId: input.locationId ?? null,
          organizationId: input.organizationId,
          title: input.title,
        },
      });
      await transaction.publicationRevision.create({
        data: revisionData(input),
      });
      await createRevisionMedia(transaction, input);

      const detail = await findDetail(
        transaction,
        input.organizationId,
        input.publicationId,
      );
      await completeDraftMutation(
        transaction,
        input,
        claim.recordId,
        detail,
        "created",
      );
      return Object.freeze({
        detail,
        status: "created",
      });
    });
  }

  async findById(
    scope: Readonly<{ organizationId: string }>,
    publicationId: string,
  ): Promise<PublicationDraftDetailRecord | null> {
    const detail = await this.#database.publication.findFirst({
      select: publicationDetailFields,
      where: { id: publicationId, organizationId: scope.organizationId },
    });
    return detail === null ? null : mapDetail(detail);
  }

  async list(
    filter: PublicationDraftListFilter,
  ): Promise<PaginatedRecords<PublicationDraftListItemRecord>> {
    assertPagination(filter.page, filter.limit);
    const where = {
      organizationId: filter.organizationId,
      ...(filter.locationId === undefined
        ? {}
        : { locationId: filter.locationId }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
    } satisfies Prisma.PublicationWhereInput;
    const [rows, total] = await this.#database.$transaction([
      this.#database.publication.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: publicationDetailFields,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        where,
      }),
      this.#database.publication.count({ where }),
    ]);
    return Object.freeze({
      items: Object.freeze(
        rows.map((row) => {
          const detail = mapDetail(row);
          return Object.freeze({
            ...detail.publication,
            ...(detail.latestRevision.contentBriefRunId === undefined
              ? {}
              : {
                  latestContentBriefRunId:
                    detail.latestRevision.contentBriefRunId,
                }),
            latestContentHash: detail.latestRevision.contentHash,
            latestRevisionId: detail.latestRevision.id,
            latestRevisionNumber: detail.latestRevision.revisionNumber,
          });
        }),
      ),
      limit: filter.limit,
      page: filter.page,
      total,
    });
  }

  async listRevisions(
    filter: PublicationRevisionListFilter,
  ): Promise<PaginatedRecords<PublicationRevisionRecord>> {
    assertPagination(filter.page, filter.limit);
    const where = {
      organizationId: filter.organizationId,
      publicationId: filter.publicationId,
    };
    const publication = await this.#database.publication.findFirst({
      select: { id: true },
      where: {
        id: filter.publicationId,
        organizationId: filter.organizationId,
      },
    });
    if (publication === null) {
      return Object.freeze({
        items: Object.freeze([]),
        limit: filter.limit,
        page: filter.page,
        total: 0,
      });
    }
    const [rows, total] = await this.#database.$transaction([
      this.#database.publicationRevision.findMany({
        orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
        select: revisionFields,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        where,
      }),
      this.#database.publicationRevision.count({ where }),
    ]);
    return Object.freeze({
      items: Object.freeze(rows.map(mapRevision)),
      limit: filter.limit,
      page: filter.page,
      total,
    });
  }

  async update(
    input: PersistPublicationDraftUpdateInput,
  ): Promise<PublicationDraftUpdateResult> {
    return this.#database.$transaction(async (transaction) => {
      assertReliableMutationScope(input);
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "replayed":
          return Object.freeze({
            detail: replayDetail(claim.responseBody),
            replayed: true,
            status: "updated",
          });
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "claimed":
          break;
      }
      const lockedPublications = await transaction.$queryRaw<
        { status: string; version: number }[]
      >`
        SELECT "status"::text AS "status", "version"
        FROM "publications"
        WHERE "organization_id" = ${input.organizationId}::uuid
          AND "id" = ${input.publicationId}::uuid
        FOR UPDATE
      `;
      const current = lockedPublications[0];
      if (current === undefined) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      if (current.version !== input.expectedVersion) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      if (current.status !== "draft") {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-state" });
      }
      if (!(await writeReferencesAreValid(transaction, input))) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-reference" });
      }

      const latestRevision = await transaction.publicationRevision.aggregate({
        _max: { revisionNumber: true },
        where: {
          organizationId: input.organizationId,
          publicationId: input.publicationId,
        },
      });
      const revisionNumber = (latestRevision._max.revisionNumber ?? 0) + 1;
      await transaction.publicationRevision.create({
        data: {
          ...revisionData(input),
          revisionNumber,
        },
      });
      await createRevisionMedia(transaction, input);
      const updated = await transaction.publication.updateMany({
        data: {
          locationId: input.locationId ?? null,
          title: input.title,
          version: { increment: 1 },
        },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
          status: "draft",
          version: input.expectedVersion,
        },
      });
      if (updated.count !== 1) {
        throw new Error("La publicación bloqueada perdió su versión.");
      }

      const detail = await findDetail(
        transaction,
        input.organizationId,
        input.publicationId,
      );
      await completeDraftMutation(
        transaction,
        input,
        claim.recordId,
        detail,
        "updated",
      );
      return Object.freeze({
        detail,
        status: "updated",
      });
    });
  }
}
