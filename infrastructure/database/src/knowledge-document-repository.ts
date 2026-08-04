import type {
  KnowledgeActivationResult,
  KnowledgeDocumentRepository,
  KnowledgeRetrievalRepository,
  KnowledgeDocumentSensitivity,
  KnowledgeDocumentVersionRecord,
  KnowledgeDocumentVersionStatus,
  KnowledgeRemoteStatus,
  KnowledgeSyncFailureCode,
  KnowledgeSyncFailureInput,
  ReserveKnowledgeDocumentVersionInput,
  ReserveKnowledgeDocumentVersionResult,
  SupportedKnowledgeMimeType,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type {
  KnowledgeDocumentVersion,
  Prisma,
} from "./generated/prisma/client.ts";

function parseLocationIds(locationIds: Prisma.JsonValue): readonly string[] {
  if (!Array.isArray(locationIds)) {
    throw new Error("El ámbito local del documento no es válido.");
  }
  const parsed: string[] = [];
  for (const locationId of locationIds) {
    if (typeof locationId !== "string") {
      throw new Error("El ámbito local del documento no es válido.");
    }
    parsed.push(locationId);
  }
  return Object.freeze(parsed);
}

function mapMimeType(mimeType: string): SupportedKnowledgeMimeType {
  switch (mimeType) {
    case "application/pdf":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "text/markdown":
    case "text/plain":
      return mimeType;
    default:
      throw new Error("El formato persistido del documento no es válido.");
  }
}

function mapSensitivity(sensitivity: string): KnowledgeDocumentSensitivity {
  switch (sensitivity) {
    case "confidential":
    case "internal":
    case "public":
      return sensitivity;
    default:
      throw new Error("La sensibilidad persistida no es válida.");
  }
}

function mapFailureCode(code: string | null): KnowledgeSyncFailureCode | null {
  switch (code) {
    case null:
    case "provider-error":
    case "provider-not-found":
    case "remote-indexing-failed":
    case "timeout":
      return code;
    default:
      throw new Error("El fallo persistido de sincronización no es válido.");
  }
}

function mapVersionStatus(
  status: KnowledgeDocumentVersion["status"],
): KnowledgeDocumentVersionStatus {
  return status;
}

function mapRemoteStatus(
  status: KnowledgeDocumentVersion["remoteStatus"],
): KnowledgeRemoteStatus {
  return status;
}

function mapRecord(
  record: KnowledgeDocumentVersion & {
    readonly document: { readonly sourceKey: string; readonly title: string };
  },
): KnowledgeDocumentVersionRecord {
  return Object.freeze({
    activatedAt: record.activatedAt?.toISOString() ?? null,
    approvalReference: record.approvalReference,
    approvedAt: record.approvedAt.toISOString(),
    brand: record.brand,
    byteSize: Number(record.byteSize),
    contentHash: record.contentHash,
    documentId: record.documentId,
    documentType: record.documentType,
    effectiveFrom: record.effectiveFrom.toISOString(),
    effectiveUntil: record.effectiveUntil?.toISOString() ?? null,
    failureCode: mapFailureCode(record.failureCode),
    failureMessage: record.failureMessage,
    failureRetryable: record.failureRetryable,
    filename: record.filename,
    id: record.id,
    locationIds: parseLocationIds(record.locationIds),
    mimeType: mapMimeType(record.mimeType),
    organizationId: record.organizationId,
    providerFileId: record.providerFileId,
    providerVectorStoreId: record.providerVectorStoreId,
    remoteStatus: mapRemoteStatus(record.remoteStatus),
    retiredAt: record.retiredAt?.toISOString() ?? null,
    sensitivity: mapSensitivity(record.sensitivity),
    sourceKey: record.document.sourceKey,
    sourceOwner: record.sourceOwner,
    status: mapVersionStatus(record.status),
    title: record.document.title,
    version: record.version,
  });
}

const versionWithDocument = {
  document: { select: { sourceKey: true, title: true } },
} as const;

export class PrismaKnowledgeDocumentRepository
  implements KnowledgeDocumentRepository, KnowledgeRetrievalRepository
{
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async reserveVersion(
    input: ReserveKnowledgeDocumentVersionInput,
  ): Promise<ReserveKnowledgeDocumentVersionResult> {
    return this.#database.$transaction(
      async (transaction) => {
        const document = await transaction.knowledgeDocument.upsert({
          create: {
            organizationId: input.organizationId,
            sourceKey: input.sourceKey,
            title: input.title,
          },
          update: { title: input.title },
          where: {
            organizationId_sourceKey: {
              organizationId: input.organizationId,
              sourceKey: input.sourceKey,
            },
          },
        });
        await transaction.$queryRaw<readonly { readonly id: string }[]>`
          SELECT "id"
          FROM "knowledge_documents"
          WHERE "organization_id" = ${input.organizationId}::uuid
            AND "id" = ${document.id}::uuid
          FOR UPDATE
        `;
        const duplicate = await transaction.knowledgeDocumentVersion.findUnique(
          {
            include: versionWithDocument,
            where: {
              documentId_contentHash: {
                contentHash: input.contentHash,
                documentId: document.id,
              },
            },
          },
        );
        if (duplicate !== null) {
          return Object.freeze({
            record: mapRecord(duplicate),
            status: "duplicate",
          });
        }
        const latest = await transaction.knowledgeDocumentVersion.aggregate({
          _max: { version: true },
          where: {
            documentId: document.id,
            organizationId: input.organizationId,
          },
        });
        const created = await transaction.knowledgeDocumentVersion.create({
          data: {
            approvalReference: input.approvalReference,
            approvedAt: new Date(input.approvedAt),
            brand: input.brand,
            byteSize: BigInt(input.byteSize),
            contentHash: input.contentHash,
            documentId: document.id,
            documentType: input.documentType,
            effectiveFrom: new Date(input.effectiveFrom),
            effectiveUntil:
              input.effectiveUntil === null
                ? null
                : new Date(input.effectiveUntil),
            filename: input.filename,
            locationIds: [...input.locationIds],
            mimeType: input.mimeType,
            organizationId: input.organizationId,
            providerVectorStoreId: input.providerVectorStoreId,
            sensitivity: input.sensitivity,
            sourceOwner: input.sourceOwner,
            version: (latest._max.version ?? 0) + 1,
          },
          include: versionWithDocument,
        });
        return Object.freeze({
          record: mapRecord(created),
          status: "reserved",
        });
      },
      { isolationLevel: "Serializable" },
    );
  }

  async markUploaded(
    organizationId: string,
    versionId: string,
    providerFileId: string,
  ): Promise<KnowledgeDocumentVersionRecord> {
    await this.#database.knowledgeDocumentVersion.updateMany({
      data: {
        failureCode: null,
        failureMessage: null,
        failureRetryable: null,
        providerFileId,
        remoteStatus: "uploaded",
        status: "uploaded",
      },
      where: {
        id: versionId,
        organizationId,
        status: { in: ["pending_upload", "sync_failed", "uploaded"] },
      },
    });
    return this.#requiredVersion(organizationId, versionId);
  }

  async markIndexing(
    organizationId: string,
    versionId: string,
    remoteStatus: "completed" | "failed" | "in_progress",
  ): Promise<KnowledgeDocumentVersionRecord> {
    await this.#database.knowledgeDocumentVersion.updateMany({
      data: {
        failureCode: null,
        failureMessage: null,
        failureRetryable: null,
        remoteStatus,
        status: "indexing",
      },
      where: {
        id: versionId,
        organizationId,
        status: { in: ["indexing", "sync_failed", "uploaded"] },
      },
    });
    return this.#requiredVersion(organizationId, versionId);
  }

  async activateVersion(
    organizationId: string,
    versionId: string,
    activatedAt: string,
  ): Promise<KnowledgeActivationResult> {
    return this.#database.$transaction(
      async (transaction) => {
        const candidate = await transaction.knowledgeDocumentVersion.findFirst({
          include: versionWithDocument,
          where: { id: versionId, organizationId },
        });
        if (
          candidate === null ||
          candidate.providerFileId === null ||
          candidate.remoteStatus !== "completed" ||
          !["indexing", "sync_failed"].includes(candidate.status)
        ) {
          throw new Error(
            "La versión no está completamente indexada para activarse.",
          );
        }
        const document = await transaction.knowledgeDocument.findFirst({
          where: {
            id: candidate.documentId,
            organizationId,
          },
        });
        if (document === null) {
          throw new Error("La fuente documental ya no existe.");
        }
        let superseded: KnowledgeDocumentVersionRecord | null = null;
        if (
          document.activeVersionId !== null &&
          document.activeVersionId !== candidate.id
        ) {
          const previous = await transaction.knowledgeDocumentVersion.update({
            data: { status: "superseded" },
            include: versionWithDocument,
            where: { id: document.activeVersionId },
          });
          superseded = mapRecord(previous);
        }
        const activationDate = new Date(activatedAt);
        await transaction.knowledgeDocumentVersion.update({
          data: {
            activatedAt: activationDate,
            failureCode: null,
            failureMessage: null,
            failureRetryable: null,
            status: "active",
          },
          where: { id: candidate.id },
        });
        await transaction.knowledgeDocument.update({
          data: { activeVersionId: candidate.id },
          where: { id: candidate.documentId },
        });
        const active = await transaction.knowledgeDocumentVersion.findUnique({
          include: versionWithDocument,
          where: { id: candidate.id },
        });
        if (active === null) {
          throw new Error("No se pudo leer la versión documental activada.");
        }
        return Object.freeze({
          active: mapRecord(active),
          superseded,
        });
      },
      { isolationLevel: "Serializable" },
    );
  }

  async beginRetirement(
    organizationId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null> {
    return this.#database.$transaction(
      async (transaction) => {
        const document = await transaction.knowledgeDocument.findFirst({
          where: { id: documentId, organizationId },
        });
        if (document === null) {
          return null;
        }
        if (document.activeVersionId === null) {
          const retryable =
            await transaction.knowledgeDocumentVersion.findFirst({
              include: versionWithDocument,
              orderBy: [{ version: "desc" }, { id: "asc" }],
              where: {
                documentId,
                organizationId,
                status: "retiring",
              },
            });
          return retryable === null ? null : mapRecord(retryable);
        }
        const active = await transaction.knowledgeDocumentVersion.findFirst({
          include: versionWithDocument,
          where: {
            id: document.activeVersionId,
            organizationId,
            status: "active",
          },
        });
        if (active === null) {
          throw new Error("La referencia de versión activa es inconsistente.");
        }
        await transaction.knowledgeDocument.update({
          data: { activeVersionId: null },
          where: { id: document.id },
        });
        const retiring = await transaction.knowledgeDocumentVersion.update({
          data: {
            failureCode: null,
            failureMessage: null,
            failureRetryable: null,
            status: "retiring",
          },
          include: versionWithDocument,
          where: { id: active.id },
        });
        return mapRecord(retiring);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async completeRetirement(
    organizationId: string,
    versionId: string,
    retiredAt: string,
  ): Promise<KnowledgeDocumentVersionRecord> {
    await this.#database.knowledgeDocumentVersion.updateMany({
      data: {
        failureCode: null,
        failureMessage: null,
        failureRetryable: null,
        remoteStatus: "detached",
        retiredAt: new Date(retiredAt),
        status: "retired",
      },
      where: {
        id: versionId,
        organizationId,
        status: "retiring",
      },
    });
    return this.#requiredVersion(organizationId, versionId);
  }

  async markFailure(
    input: KnowledgeSyncFailureInput,
  ): Promise<KnowledgeDocumentVersionRecord> {
    const current = await this.#requiredVersion(
      input.organizationId,
      input.versionId,
    );
    const preservedStatuses: readonly KnowledgeDocumentVersionStatus[] = [
      "active",
      "retired",
      "retiring",
      "superseded",
    ];
    await this.#database.knowledgeDocumentVersion.updateMany({
      data: {
        failureCode: input.code,
        failureMessage: input.message.slice(0, 300),
        failureRetryable: input.retryable,
        status: preservedStatuses.includes(current.status)
          ? current.status
          : "sync_failed",
      },
      where: {
        id: input.versionId,
        organizationId: input.organizationId,
      },
    });
    return this.#requiredVersion(input.organizationId, input.versionId);
  }

  findVersion(
    organizationId: string,
    versionId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null> {
    return this.#database.knowledgeDocumentVersion
      .findFirst({
        include: versionWithDocument,
        where: { id: versionId, organizationId },
      })
      .then((record) => (record === null ? null : mapRecord(record)));
  }

  async findActiveSources(
    input: Parameters<KnowledgeRetrievalRepository["findActiveSources"]>[0],
  ): Promise<readonly KnowledgeDocumentVersionRecord[]> {
    const at = new Date(input.at);
    const records = await this.#database.knowledgeDocumentVersion.findMany({
      include: versionWithDocument,
      orderBy: [
        { document: { sourceKey: "asc" } },
        { version: "desc" },
        { id: "asc" },
      ],
      take: input.limit,
      where: {
        activeFor: { isNot: null },
        effectiveFrom: { lte: at },
        AND: [
          {
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
          },
          {
            OR:
              input.locationId === null
                ? [{ locationIds: { equals: [] } }]
                : [
                    { locationIds: { equals: [] } },
                    {
                      locationIds: {
                        array_contains: [input.locationId],
                      },
                    },
                  ],
          },
        ],
        organizationId: input.organizationId,
        status: "active",
      },
    });
    return Object.freeze(records.map(mapRecord));
  }

  async #requiredVersion(
    organizationId: string,
    versionId: string,
  ): Promise<KnowledgeDocumentVersionRecord> {
    const record = await this.findVersion(organizationId, versionId);
    if (record === null) {
      throw new Error("La versión documental no existe en la organización.");
    }
    return record;
  }
}
