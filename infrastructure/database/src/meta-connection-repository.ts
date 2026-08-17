import {
  validateAuditMetadata,
  type AuditEventInput,
  type EncryptedSecret,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type MetaConnectionSecretRecord,
  type PersistedMetaAssetInput,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type { Prisma } from "./generated/prisma/client.ts";

const metaConnectionSelection = {
  accountName: true,
  assets: {
    orderBy: [{ kind: "asc" }, { providerAssetId: "asc" }],
    select: {
      id: true,
      kind: true,
      name: true,
      providerAssetId: true,
      status: true,
      username: true,
    },
  },
  createdAt: true,
  expiresAt: true,
  grantedPermissions: true,
  health: true,
  id: true,
  lastCheckedAt: true,
  organizationId: true,
  providerAccountId: true,
  revokedAt: true,
  updatedAt: true,
  version: true,
} satisfies Prisma.MetaConnectionSelect;

const metaConnectionSecretSelection = {
  ...metaConnectionSelection,
  accessCiphertext: true,
  accessIv: true,
  accessKeyVersion: true,
  accessTag: true,
} satisfies Prisma.MetaConnectionSelect;

type MetaConnectionRow = Prisma.MetaConnectionGetPayload<{
  select: typeof metaConnectionSelection;
}>;
type MetaConnectionSecretRow = Prisma.MetaConnectionGetPayload<{
  select: typeof metaConnectionSecretSelection;
}>;

function stringArray(
  value: Prisma.JsonValue,
  field: string,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} no contiene una lista de texto válida.`);
  }
  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(`${field} no contiene una lista de texto válida.`);
    }
    strings.push(entry);
  }
  return Object.freeze(strings);
}

function mapMetaConnection(row: MetaConnectionRow): MetaConnectionRecord {
  return Object.freeze({
    accountName: row.accountName,
    assets: Object.freeze(
      row.assets.map((asset) =>
        Object.freeze({
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
          providerAssetId: asset.providerAssetId,
          status: asset.status,
          ...(asset.username === null ? {} : { username: asset.username }),
        }),
      ),
    ),
    createdAt: row.createdAt.toISOString(),
    ...(row.expiresAt === null
      ? {}
      : { expiresAt: row.expiresAt.toISOString() }),
    grantedPermissions: stringArray(
      row.grantedPermissions,
      "grantedPermissions",
    ),
    health: row.health,
    id: row.id,
    lastCheckedAt: row.lastCheckedAt.toISOString(),
    organizationId: row.organizationId,
    providerAccountId: row.providerAccountId,
    ...(row.revokedAt === null
      ? {}
      : { revokedAt: row.revokedAt.toISOString() }),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  });
}

function secretFromRow(row: MetaConnectionSecretRow): EncryptedSecret | null {
  if (
    row.accessCiphertext === null ||
    row.accessIv === null ||
    row.accessKeyVersion === null ||
    row.accessTag === null
  ) {
    return null;
  }
  return Object.freeze({
    authenticationTag: row.accessTag,
    ciphertext: row.accessCiphertext,
    initializationVector: row.accessIv,
    keyVersion: row.accessKeyVersion,
  });
}

function auditData(
  input: AuditEventInput,
): Prisma.AuditEventUncheckedCreateInput {
  validateAuditMetadata(input.metadata);
  return {
    actorMembershipId: input.actorMembershipId ?? null,
    entityId: input.entityId ?? null,
    entityType: input.entityType,
    id: input.eventId,
    metadata: { ...input.metadata },
    occurredAt: new Date(input.occurredAt),
    operation: input.operation,
    organizationId: input.organizationId,
    outcome: input.outcome,
  };
}

function encryptedColumns(secret: EncryptedSecret): Readonly<{
  accessCiphertext: string;
  accessIv: string;
  accessKeyVersion: string;
  accessTag: string;
}> {
  return {
    accessCiphertext: secret.ciphertext,
    accessIv: secret.initializationVector,
    accessKeyVersion: secret.keyVersion,
    accessTag: secret.authenticationTag,
  };
}

async function reconcileAssets(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  metaConnectionId: string,
  assets: readonly PersistedMetaAssetInput[],
  occurredAt: Date,
): Promise<void> {
  for (const asset of assets) {
    const secretColumns =
      asset.accessSecret === undefined
        ? {
            accessCiphertext: null,
            accessIv: null,
            accessKeyVersion: null,
            accessTag: null,
          }
        : encryptedColumns(asset.accessSecret);
    await transaction.metaConnectionAsset.upsert({
      create: {
        ...secretColumns,
        kind: asset.kind,
        metaConnectionId,
        name: asset.name,
        organizationId,
        providerAssetId: asset.providerAssetId,
        status: "active",
        username: asset.username ?? null,
      },
      update: {
        ...secretColumns,
        metaConnectionId,
        name: asset.name,
        removedAt: null,
        status: "active",
        username: asset.username ?? null,
      },
      where: {
        organizationId_kind_providerAssetId: {
          kind: asset.kind,
          organizationId,
          providerAssetId: asset.providerAssetId,
        },
      },
    });
  }

  const activeProviderAssetIds = assets.map((asset) => asset.providerAssetId);
  await transaction.metaConnectionAsset.updateMany({
    data: {
      accessCiphertext: null,
      accessIv: null,
      accessKeyVersion: null,
      accessTag: null,
      removedAt: occurredAt,
      status: "removed",
    },
    where: {
      metaConnectionId,
      organizationId,
      status: "active",
      ...(activeProviderAssetIds.length === 0
        ? {}
        : { providerAssetId: { notIn: activeProviderAssetIds } }),
    },
  });
}

export class PrismaMetaConnectionRepository implements MetaConnectionRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async consumeOAuthTransaction(
    input: Parameters<MetaConnectionRepository["consumeOAuthTransaction"]>[0],
  ): Promise<
    Awaited<ReturnType<MetaConnectionRepository["consumeOAuthTransaction"]>>
  > {
    const consumedAt = new Date(input.consumedAt);
    const result = await this.#database.metaOAuthTransaction.updateMany({
      data: { consumedAt },
      where: {
        actorMembershipId: input.actor.membershipId,
        consumedAt: null,
        expiresAt: { gt: consumedAt },
        organizationId: input.actor.organizationId,
        redirectUri: input.redirectUri,
        sessionId: input.actor.sessionId,
        stateHash: input.stateHash,
      },
    });
    return Object.freeze({
      status: result.count === 1 ? "consumed" : "invalid",
    });
  }

  async createOAuthTransaction(
    input: Parameters<MetaConnectionRepository["createOAuthTransaction"]>[0],
  ): Promise<void> {
    await this.#database.metaOAuthTransaction.create({
      data: {
        actorMembershipId: input.actor.membershipId,
        expiresAt: new Date(input.expiresAt),
        organizationId: input.actor.organizationId,
        redirectUri: input.redirectUri,
        sessionId: input.actor.sessionId,
        stateHash: input.stateHash,
      },
    });
  }

  async findSecret(
    organizationId: string,
    metaConnectionId: string,
  ): Promise<MetaConnectionSecretRecord | null> {
    const row = await this.#database.metaConnection.findFirst({
      select: metaConnectionSecretSelection,
      where: {
        accessCiphertext: { not: null },
        health: { not: "revoked" },
        id: metaConnectionId,
        organizationId,
      },
    });
    if (row === null) return null;
    const accessSecret = secretFromRow(row);
    return accessSecret === null
      ? null
      : Object.freeze({
          accessSecret,
          connection: mapMetaConnection(row),
        });
  }

  async list(organizationId: string): Promise<readonly MetaConnectionRecord[]> {
    const rows = await this.#database.metaConnection.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: metaConnectionSelection,
      where: { organizationId },
    });
    return Object.freeze(rows.map(mapMetaConnection));
  }

  async renew(
    input: Parameters<MetaConnectionRepository["renew"]>[0],
  ): Promise<Awaited<ReturnType<MetaConnectionRepository["renew"]>>> {
    return this.#database.$transaction(async (transaction) => {
      const result = await transaction.metaConnection.updateMany({
        data: {
          ...encryptedColumns(input.accessSecret),
          expiresAt:
            input.expiresAt === undefined ? null : new Date(input.expiresAt),
          grantedPermissions: [...input.grantedPermissions],
          health: input.health,
          lastCheckedAt: new Date(input.renewedAt),
          version: { increment: 1 },
        },
        where: {
          health: { not: "revoked" },
          id: input.metaConnectionId,
          organizationId: input.actor.organizationId,
        },
      });
      if (result.count !== 1) return Object.freeze({ status: "not-found" });
      await reconcileAssets(
        transaction,
        input.actor.organizationId,
        input.metaConnectionId,
        input.assets,
        new Date(input.renewedAt),
      );
      await transaction.auditEvent.create({ data: auditData(input.audit) });
      const row = await transaction.metaConnection.findUniqueOrThrow({
        select: metaConnectionSelection,
        where: {
          organizationId_id: {
            id: input.metaConnectionId,
            organizationId: input.actor.organizationId,
          },
        },
      });
      return Object.freeze({
        connection: mapMetaConnection(row),
        status: "updated",
      });
    });
  }

  async revoke(
    input: Parameters<MetaConnectionRepository["revoke"]>[0],
  ): Promise<Awaited<ReturnType<MetaConnectionRepository["revoke"]>>> {
    return this.#database.$transaction(async (transaction) => {
      const revokedAt = new Date(input.revokedAt);
      const result = await transaction.metaConnection.updateMany({
        data: {
          accessCiphertext: null,
          accessIv: null,
          accessKeyVersion: null,
          accessTag: null,
          health: "revoked",
          revokedAt,
          version: { increment: 1 },
        },
        where: {
          health: { not: "revoked" },
          id: input.metaConnectionId,
          organizationId: input.actor.organizationId,
        },
      });
      if (result.count !== 1) return Object.freeze({ status: "not-found" });
      await transaction.metaConnectionAsset.updateMany({
        data: {
          accessCiphertext: null,
          accessIv: null,
          accessKeyVersion: null,
          accessTag: null,
          removedAt: revokedAt,
          status: "removed",
        },
        where: {
          metaConnectionId: input.metaConnectionId,
          organizationId: input.actor.organizationId,
        },
      });
      await transaction.auditEvent.create({ data: auditData(input.audit) });
      const row = await transaction.metaConnection.findUniqueOrThrow({
        select: metaConnectionSelection,
        where: {
          organizationId_id: {
            id: input.metaConnectionId,
            organizationId: input.actor.organizationId,
          },
        },
      });
      return Object.freeze({
        connection: mapMetaConnection(row),
        status: "updated",
      });
    });
  }

  async save(
    input: Parameters<MetaConnectionRepository["save"]>[0],
  ): Promise<MetaConnectionRecord> {
    return this.#database.$transaction(async (transaction) => {
      const occurredAt = new Date(input.occurredAt);
      const connection = await transaction.metaConnection.upsert({
        create: {
          ...encryptedColumns(input.accessSecret),
          accountName: input.accountName,
          connectedByMembershipId: input.actor.membershipId,
          expiresAt:
            input.expiresAt === undefined ? null : new Date(input.expiresAt),
          grantedPermissions: [...input.grantedPermissions],
          health: input.health,
          lastCheckedAt: occurredAt,
          organizationId: input.actor.organizationId,
          providerAccountId: input.providerAccountId,
        },
        select: { id: true },
        update: {
          ...encryptedColumns(input.accessSecret),
          accountName: input.accountName,
          connectedByMembershipId: input.actor.membershipId,
          expiresAt:
            input.expiresAt === undefined ? null : new Date(input.expiresAt),
          grantedPermissions: [...input.grantedPermissions],
          health: input.health,
          lastCheckedAt: occurredAt,
          revokedAt: null,
          version: { increment: 1 },
        },
        where: {
          organizationId_providerAccountId: {
            organizationId: input.actor.organizationId,
            providerAccountId: input.providerAccountId,
          },
        },
      });
      await reconcileAssets(
        transaction,
        input.actor.organizationId,
        connection.id,
        input.assets,
        occurredAt,
      );
      await transaction.auditEvent.create({ data: auditData(input.audit) });
      const row = await transaction.metaConnection.findUniqueOrThrow({
        select: metaConnectionSelection,
        where: {
          organizationId_id: {
            id: connection.id,
            organizationId: input.actor.organizationId,
          },
        },
      });
      return mapMetaConnection(row);
    });
  }

  async updateHealth(
    input: Parameters<MetaConnectionRepository["updateHealth"]>[0],
  ): Promise<Awaited<ReturnType<MetaConnectionRepository["updateHealth"]>>> {
    return this.#database.$transaction(async (transaction) => {
      const result = await transaction.metaConnection.updateMany({
        data: {
          grantedPermissions: [...input.grantedPermissions],
          health: input.health,
          lastCheckedAt: new Date(input.lastCheckedAt),
          version: { increment: 1 },
        },
        where: {
          health: { not: "revoked" },
          id: input.metaConnectionId,
          organizationId: input.actor.organizationId,
        },
      });
      if (result.count !== 1) return Object.freeze({ status: "not-found" });
      if (input.assets !== undefined) {
        await reconcileAssets(
          transaction,
          input.actor.organizationId,
          input.metaConnectionId,
          input.assets,
          new Date(input.lastCheckedAt),
        );
      }
      await transaction.auditEvent.create({ data: auditData(input.audit) });
      const row = await transaction.metaConnection.findUniqueOrThrow({
        select: metaConnectionSelection,
        where: {
          organizationId_id: {
            id: input.metaConnectionId,
            organizationId: input.actor.organizationId,
          },
        },
      });
      return Object.freeze({
        connection: mapMetaConnection(row),
        status: "updated",
      });
    });
  }
}
