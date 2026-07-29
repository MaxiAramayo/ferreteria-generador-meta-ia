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
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

const publicationFields = {
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

const revisionFields = {
  approvalSnapshot: {
    select: {
      approvedAt: true,
      id: true,
    },
  },
  content: true,
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

function mapRevision(row: RevisionRow): PublicationRevisionRecord {
  const approval = row.approvalSnapshot;
  return Object.freeze({
    ...(approval === null
      ? {}
      : {
          approvalSnapshotId: approval.id,
          approvedAt: approval.approvedAt.toISOString(),
        }),
    content: row.content,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
    createdByMembershipId: row.createdByMembershipId,
    designDocument: row.designDocument,
    id: row.id,
    media: Object.freeze(row.media.map(mapRevisionMedia)),
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

function assertPagination(page: number, limit: number): void {
  if (!Number.isInteger(page) || page < 1 || page > 10_000) {
    throw new RangeError("Page must be between 1 and 10000.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Limit must be between 1 and 100.");
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
      if (!(await writeReferencesAreValid(transaction, input))) {
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

      return Object.freeze({
        detail: await findDetail(
          transaction,
          input.organizationId,
          input.publicationId,
        ),
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
        return Object.freeze({ status: "not-found" });
      }
      if (current.version !== input.expectedVersion) {
        return Object.freeze({ status: "conflict" });
      }
      if (current.status !== "draft") {
        return Object.freeze({ status: "invalid-state" });
      }
      if (!(await writeReferencesAreValid(transaction, input))) {
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

      return Object.freeze({
        detail: await findDetail(
          transaction,
          input.organizationId,
          input.publicationId,
        ),
        status: "updated",
      });
    });
  }
}
