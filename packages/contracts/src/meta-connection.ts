export type MetaConnectionHealthResponse =
  | "asset_removed"
  | "healthy"
  | "permission_revoked"
  | "revoked"
  | "token_expired";

export interface MetaConnectionAssetResponse {
  readonly id: string;
  readonly kind: "instagram_business" | "page";
  readonly name: string;
  readonly providerAssetId: string;
  readonly status: "active" | "removed";
  readonly username?: string;
}

export interface MetaConnectionResponse {
  readonly accountName: string;
  readonly assets: readonly MetaConnectionAssetResponse[];
  readonly canPublish: boolean;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly grantedPermissions: readonly string[];
  readonly health: MetaConnectionHealthResponse;
  readonly id: string;
  readonly lastCheckedAt: string;
  readonly missingPermissions: readonly string[];
  readonly provider: "meta";
  readonly revokedAt?: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface MetaOAuthStartResponse {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
  readonly provider: "meta";
}

export interface MetaOAuthCallbackResponse {
  readonly connection: MetaConnectionResponse;
  readonly status: "connected";
}

/** Respuesta exacta requerida por el callback de eliminación de Meta. */
export interface MetaDataDeletionCallbackResponse {
  readonly confirmation_code: string;
  readonly url: string;
}

export type MetaDataDeletionStatusResponse =
  | Readonly<{ completedAt: string; status: "completed" }>
  | Readonly<{ status: "not-found" }>;

export interface MetaDeauthorizationResponse {
  readonly status: "acknowledged";
}
