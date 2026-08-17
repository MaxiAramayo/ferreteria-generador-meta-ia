import type { AuthenticatedActor } from "./identity.ts";
import type { AuditEventInput, SafeJsonObject } from "./reliable-operations.ts";

export const metaRequiredPermissions = Object.freeze([
  "instagram_basic",
  "instagram_content_publish",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
] as const);

export type MetaRequiredPermission = (typeof metaRequiredPermissions)[number];

export type MetaConnectionHealth =
  | "asset_removed"
  | "healthy"
  | "permission_revoked"
  | "revoked"
  | "token_expired";

export type MetaAssetKind = "instagram_business" | "page";
export type MetaAssetStatus = "active" | "removed";

export interface EncryptedSecret {
  readonly authenticationTag: string;
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly keyVersion: string;
}

export interface MetaConnectionAssetRecord {
  readonly id: string;
  readonly kind: MetaAssetKind;
  readonly name: string;
  readonly providerAssetId: string;
  readonly status: MetaAssetStatus;
  readonly username?: string;
}

export interface MetaConnectionRecord {
  readonly accountName: string;
  readonly assets: readonly MetaConnectionAssetRecord[];
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly grantedPermissions: readonly string[];
  readonly health: MetaConnectionHealth;
  readonly id: string;
  readonly lastCheckedAt: string;
  readonly organizationId: string;
  readonly providerAccountId: string;
  readonly revokedAt?: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface MetaOAuthTransactionInput {
  readonly actor: AuthenticatedActor;
  readonly expiresAt: string;
  readonly redirectUri: string;
  readonly stateHash: string;
}

export interface ConsumeMetaOAuthTransactionInput {
  readonly actor: AuthenticatedActor;
  readonly consumedAt: string;
  readonly redirectUri: string;
  readonly stateHash: string;
}

export type ConsumeMetaOAuthTransactionResult =
  Readonly<{ status: "consumed" }> | Readonly<{ status: "invalid" }>;

export interface PersistedMetaAssetInput {
  readonly accessSecret?: EncryptedSecret;
  readonly kind: MetaAssetKind;
  readonly name: string;
  readonly providerAssetId: string;
  readonly username?: string;
}

export interface SaveMetaConnectionInput {
  readonly accessSecret: EncryptedSecret;
  readonly accountName: string;
  readonly actor: AuthenticatedActor;
  readonly assets: readonly PersistedMetaAssetInput[];
  readonly audit: AuditEventInput;
  readonly expiresAt?: string;
  readonly grantedPermissions: readonly string[];
  readonly health: Exclude<MetaConnectionHealth, "revoked">;
  readonly occurredAt: string;
  readonly providerAccountId: string;
}

export interface MetaConnectionSecretRecord {
  readonly accessSecret: EncryptedSecret;
  readonly connection: MetaConnectionRecord;
}

export interface UpdateMetaConnectionHealthInput {
  readonly actor: AuthenticatedActor;
  readonly assets?: readonly PersistedMetaAssetInput[];
  readonly audit: AuditEventInput;
  readonly grantedPermissions: readonly string[];
  readonly health: Exclude<MetaConnectionHealth, "revoked">;
  readonly lastCheckedAt: string;
  readonly metaConnectionId: string;
}

export interface RenewMetaConnectionInput {
  readonly accessSecret: EncryptedSecret;
  readonly actor: AuthenticatedActor;
  readonly assets: readonly PersistedMetaAssetInput[];
  readonly audit: AuditEventInput;
  readonly expiresAt?: string;
  readonly grantedPermissions: readonly string[];
  readonly health: Exclude<MetaConnectionHealth, "revoked">;
  readonly metaConnectionId: string;
  readonly renewedAt: string;
}

export interface RevokeMetaConnectionInput {
  readonly actor: AuthenticatedActor;
  readonly audit: AuditEventInput;
  readonly metaConnectionId: string;
  readonly revokedAt: string;
}

export type MetaConnectionMutationResult =
  | Readonly<{ connection: MetaConnectionRecord; status: "updated" }>
  | Readonly<{ status: "not-found" }>;

export interface MetaConnectionRepository {
  consumeOAuthTransaction(
    input: ConsumeMetaOAuthTransactionInput,
  ): Promise<ConsumeMetaOAuthTransactionResult>;
  createOAuthTransaction(input: MetaOAuthTransactionInput): Promise<void>;
  findSecret(
    organizationId: string,
    metaConnectionId: string,
  ): Promise<MetaConnectionSecretRecord | null>;
  list(organizationId: string): Promise<readonly MetaConnectionRecord[]>;
  renew(input: RenewMetaConnectionInput): Promise<MetaConnectionMutationResult>;
  revoke(
    input: RevokeMetaConnectionInput,
  ): Promise<MetaConnectionMutationResult>;
  save(input: SaveMetaConnectionInput): Promise<MetaConnectionRecord>;
  updateHealth(
    input: UpdateMetaConnectionHealthInput,
  ): Promise<MetaConnectionMutationResult>;
}

export function missingMetaPermissions(
  grantedPermissions: readonly string[],
): readonly MetaRequiredPermission[] {
  const granted = new Set(grantedPermissions);
  return Object.freeze(
    metaRequiredPermissions.filter((permission) => !granted.has(permission)),
  );
}

export function metaConnectionCanPublish(
  connection: MetaConnectionRecord,
): boolean {
  return (
    connection.health === "healthy" &&
    missingMetaPermissions(connection.grantedPermissions).length === 0 &&
    connection.assets.some(
      (asset) => asset.kind === "page" && asset.status === "active",
    ) &&
    connection.assets.some(
      (asset) =>
        asset.kind === "instagram_business" && asset.status === "active",
    )
  );
}

export function metaAuditMetadata(input: {
  readonly assetCount: number;
  readonly health: MetaConnectionHealth;
  readonly permissionCount: number;
}): SafeJsonObject {
  return Object.freeze({
    assetCount: input.assetCount,
    health: input.health,
    permissionCount: input.permissionCount,
    provider: "meta",
  });
}
