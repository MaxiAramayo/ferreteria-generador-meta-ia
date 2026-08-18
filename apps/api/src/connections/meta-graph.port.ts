import type { MetaAssetKind, MetaConnectionHealth } from "@aramayo/domain";

export interface MetaRemoteCredential {
  readonly accessToken: string;
  readonly expiresAt?: string;
}

export interface MetaRemoteAsset {
  readonly accessToken?: string;
  readonly kind: MetaAssetKind;
  readonly name: string;
  readonly providerAssetId: string;
  readonly username?: string;
}

export interface MetaRemoteDiscovery {
  readonly accountName: string;
  readonly assets: readonly MetaRemoteAsset[];
  readonly grantedPermissions: readonly string[];
  readonly providerAccountId: string;
}

export interface MetaGraphPort {
  authorizationUrl(state: string): string;
  discover(accessToken: string): Promise<MetaRemoteDiscovery>;
  exchangeCode(code: string): Promise<MetaRemoteCredential>;
  renew(accessToken: string): Promise<MetaRemoteCredential>;
  revoke(accessToken: string): Promise<void>;
}

export class MetaGraphError extends Error {
  readonly health: Exclude<
    MetaConnectionHealth,
    "asset_removed" | "healthy" | "revoked"
  >;

  constructor(
    health: Exclude<
      MetaConnectionHealth,
      "asset_removed" | "healthy" | "revoked"
    >,
    message: string,
  ) {
    super(message);
    this.health = health;
    this.name = "MetaGraphError";
  }
}

export class MetaIntegrationDisabledError extends Error {
  constructor() {
    super("La integración Meta no está configurada en este entorno.");
    this.name = "MetaIntegrationDisabledError";
  }
}

export class MetaGraphUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaGraphUnavailableError";
  }
}

/**
 * Meta respondió que el objeto pedido no existe o no es visible para esta
 * credencial. Para un activo declarado eso significa que dejó de estar
 * disponible, que es distinto de que Meta esté caído: hereda de
 * `MetaGraphUnavailableError` para que quien no necesite la distinción lo
 * siga tratando como una falla de proveedor.
 */
export class MetaAssetUnavailableError extends MetaGraphUnavailableError {
  constructor() {
    super("Meta no expone el activo declarado a esta conexión.");
    this.name = "MetaAssetUnavailableError";
  }
}
