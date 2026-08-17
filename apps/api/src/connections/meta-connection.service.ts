import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { ApiConfiguration } from "@aramayo/configuration/api";
import type {
  MetaConnectionResponse,
  MetaOAuthCallbackResponse,
  MetaOAuthStartResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  metaAuditMetadata,
  metaConnectionCanPublish,
  missingMetaPermissions,
  type AuditEventInput,
  type AuthenticatedActor,
  type MetaConnectionHealth,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type MetaConnectionSecretRecord,
  type PersistedMetaAssetInput,
} from "@aramayo/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import { META_CONNECTION_REPOSITORY } from "../database/database.tokens.ts";
import { META_GRAPH_PORT } from "./connections.tokens.ts";
import {
  MetaGraphError,
  MetaGraphUnavailableError,
  MetaIntegrationDisabledError,
  type MetaGraphPort,
  type MetaRemoteDiscovery,
} from "./meta-graph.port.ts";
import { TokenCipher } from "./token-cipher.ts";

const oauthLifetimeMilliseconds = 10 * 60 * 1_000;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function responseFor(connection: MetaConnectionRecord): MetaConnectionResponse {
  return Object.freeze({
    accountName: connection.accountName,
    assets: connection.assets,
    canPublish: metaConnectionCanPublish(connection),
    createdAt: connection.createdAt,
    ...(connection.expiresAt === undefined
      ? {}
      : { expiresAt: connection.expiresAt }),
    grantedPermissions: connection.grantedPermissions,
    health: connection.health,
    id: connection.id,
    lastCheckedAt: connection.lastCheckedAt,
    missingPermissions: missingMetaPermissions(connection.grantedPermissions),
    provider: "meta",
    ...(connection.revokedAt === undefined
      ? {}
      : { revokedAt: connection.revokedAt }),
    updatedAt: connection.updatedAt,
    version: connection.version,
  });
}

function healthFor(
  discovery: MetaRemoteDiscovery,
  expiresAt: string | undefined,
  at: Date,
): Exclude<MetaConnectionHealth, "revoked"> {
  if (
    expiresAt !== undefined &&
    new Date(expiresAt).getTime() <= at.getTime()
  ) {
    return "token_expired";
  }
  if (missingMetaPermissions(discovery.grantedPermissions).length > 0) {
    return "permission_revoked";
  }
  const hasPage = discovery.assets.some((asset) => asset.kind === "page");
  const hasInstagram = discovery.assets.some(
    (asset) => asset.kind === "instagram_business",
  );
  return hasPage && hasInstagram ? "healthy" : "asset_removed";
}

@Injectable()
export class MetaConnectionService {
  readonly #cipher: TokenCipher;
  readonly #configuration: ApiConfiguration;
  readonly #graph: MetaGraphPort;
  readonly #repository: MetaConnectionRepository;

  constructor(
    @Inject(API_CONFIGURATION) configuration: ApiConfiguration,
    @Inject(META_GRAPH_PORT) graph: MetaGraphPort,
    @Inject(META_CONNECTION_REPOSITORY)
    repository: MetaConnectionRepository,
    cipher: TokenCipher,
  ) {
    this.#cipher = cipher;
    this.#configuration = configuration;
    this.#graph = graph;
    this.#repository = repository;
  }

  async start(
    actor: AuthenticatedActor,
    at = new Date(),
  ): Promise<MetaOAuthStartResponse> {
    this.#requireAdministrator(actor);
    const state = randomBytes(32).toString("base64url");
    const authorizationUrl = this.#graph.authorizationUrl(state);
    const expiresAt = new Date(
      at.getTime() + oauthLifetimeMilliseconds,
    ).toISOString();
    await this.#repository.createOAuthTransaction({
      actor,
      expiresAt,
      redirectUri: this.#redirectUri(),
      stateHash: sha256(state),
    });
    return Object.freeze({ authorizationUrl, expiresAt, provider: "meta" });
  }

  async callback(
    actor: AuthenticatedActor,
    input: Readonly<{ code?: string; error?: string; state: string }>,
    at = new Date(),
  ): Promise<MetaOAuthCallbackResponse> {
    this.#requireAdministrator(actor);
    const transaction = await this.#repository.consumeOAuthTransaction({
      actor,
      consumedAt: at.toISOString(),
      redirectUri: this.#redirectUri(),
      stateHash: sha256(input.state),
    });
    if (transaction.status === "invalid") {
      throw new ForbiddenException(
        "La autorización Meta venció, ya fue utilizada o no pertenece a esta sesión.",
      );
    }
    if (input.code === undefined || input.error !== undefined) {
      throw new BadRequestException(
        "Meta no autorizó la conexión. Volvé a iniciar el proceso.",
      );
    }

    try {
      const shortLived = await this.#graph.exchangeCode(input.code);
      const credential = await this.#graph.renew(shortLived.accessToken);
      const discovery = await this.#graph.discover(credential.accessToken);
      const assets = this.#persistedAssets(discovery);
      const health = healthFor(discovery, credential.expiresAt, at);
      const connection = await this.#repository.save({
        accessSecret: this.#cipher.encrypt(credential.accessToken),
        accountName: discovery.accountName,
        actor,
        assets,
        audit: this.#audit(
          actor,
          "meta.connection.connected",
          metaAuditMetadata({
            assetCount: assets.length,
            health,
            permissionCount: discovery.grantedPermissions.length,
          }),
          at,
        ),
        ...(credential.expiresAt === undefined
          ? {}
          : { expiresAt: credential.expiresAt }),
        grantedPermissions: discovery.grantedPermissions,
        health,
        occurredAt: at.toISOString(),
        providerAccountId: discovery.providerAccountId,
      });
      return Object.freeze({
        connection: responseFor(connection),
        status: "connected",
      });
    } catch (cause: unknown) {
      this.#throwProviderFailure(cause);
    }
  }

  async list(
    actor: AuthenticatedActor,
  ): Promise<readonly MetaConnectionResponse[]> {
    this.#requireAdministrator(actor);
    const connections = await this.#repository.list(actor.organizationId);
    return Object.freeze(connections.map(responseFor));
  }

  async checkHealth(
    actor: AuthenticatedActor,
    metaConnectionId: string,
    at = new Date(),
  ): Promise<MetaConnectionResponse> {
    this.#requireAdministrator(actor);
    const stored = await this.#requiredSecret(actor, metaConnectionId);
    const accessToken = this.#cipher.decrypt(stored.accessSecret);
    try {
      const discovery = await this.#graph.discover(accessToken);
      const health = healthFor(discovery, stored.connection.expiresAt, at);
      const assets = this.#persistedAssets(discovery);
      const result = await this.#repository.updateHealth({
        actor,
        assets,
        audit: this.#audit(
          actor,
          "meta.connection.health_checked",
          metaAuditMetadata({
            assetCount: assets.length,
            health,
            permissionCount: discovery.grantedPermissions.length,
          }),
          at,
          metaConnectionId,
        ),
        grantedPermissions: discovery.grantedPermissions,
        health,
        lastCheckedAt: at.toISOString(),
        metaConnectionId,
      });
      if (result.status === "not-found") throw new NotFoundException();
      return responseFor(result.connection);
    } catch (cause: unknown) {
      if (cause instanceof MetaGraphError) {
        const result = await this.#repository.updateHealth({
          actor,
          audit: this.#audit(
            actor,
            "meta.connection.health_checked",
            metaAuditMetadata({
              assetCount: stored.connection.assets.length,
              health: cause.health,
              permissionCount: stored.connection.grantedPermissions.length,
            }),
            at,
            metaConnectionId,
          ),
          grantedPermissions: stored.connection.grantedPermissions,
          health: cause.health,
          lastCheckedAt: at.toISOString(),
          metaConnectionId,
        });
        if (result.status === "not-found") throw new NotFoundException();
        return responseFor(result.connection);
      }
      this.#throwProviderFailure(cause);
    }
  }

  async renew(
    actor: AuthenticatedActor,
    metaConnectionId: string,
    at = new Date(),
  ): Promise<MetaConnectionResponse> {
    this.#requireAdministrator(actor);
    const stored = await this.#requiredSecret(actor, metaConnectionId);
    try {
      const credential = await this.#graph.renew(
        this.#cipher.decrypt(stored.accessSecret),
      );
      const discovery = await this.#graph.discover(credential.accessToken);
      const assets = this.#persistedAssets(discovery);
      const health = healthFor(discovery, credential.expiresAt, at);
      const result = await this.#repository.renew({
        accessSecret: this.#cipher.encrypt(credential.accessToken),
        actor,
        assets,
        audit: this.#audit(
          actor,
          "meta.connection.renewed",
          metaAuditMetadata({
            assetCount: assets.length,
            health,
            permissionCount: discovery.grantedPermissions.length,
          }),
          at,
          metaConnectionId,
        ),
        ...(credential.expiresAt === undefined
          ? {}
          : { expiresAt: credential.expiresAt }),
        grantedPermissions: discovery.grantedPermissions,
        health,
        metaConnectionId,
        renewedAt: at.toISOString(),
      });
      if (result.status === "not-found") throw new NotFoundException();
      return responseFor(result.connection);
    } catch (cause: unknown) {
      this.#throwProviderFailure(cause);
    }
  }

  async revoke(
    actor: AuthenticatedActor,
    metaConnectionId: string,
    at = new Date(),
  ): Promise<MetaConnectionResponse> {
    this.#requireAdministrator(actor);
    const stored = await this.#requiredSecret(actor, metaConnectionId);
    let remoteConfirmed = false;
    try {
      await this.#graph.revoke(this.#cipher.decrypt(stored.accessSecret));
      remoteConfirmed = true;
    } catch {
      // La revocación local y la eliminación criptográfica no dependen de que
      // Meta responda. La reconciliación remota queda visible en auditoría.
    }
    const result = await this.#repository.revoke({
      actor,
      audit: this.#audit(
        actor,
        "meta.connection.revoked",
        Object.freeze({ provider: "meta", remoteConfirmed }),
        at,
        metaConnectionId,
      ),
      metaConnectionId,
      revokedAt: at.toISOString(),
    });
    if (result.status === "not-found") throw new NotFoundException();
    return responseFor(result.connection);
  }

  #audit(
    actor: AuthenticatedActor,
    operation: string,
    metadata: AuditEventInput["metadata"],
    at: Date,
    entityId?: string,
  ): AuditEventInput {
    return Object.freeze({
      actorMembershipId: actor.membershipId,
      ...(entityId === undefined ? {} : { entityId }),
      entityType: "meta_connection",
      eventId: randomUUID(),
      metadata,
      occurredAt: at.toISOString(),
      operation,
      organizationId: actor.organizationId,
      outcome: "success",
    });
  }

  #persistedAssets(
    discovery: MetaRemoteDiscovery,
  ): readonly PersistedMetaAssetInput[] {
    return Object.freeze(
      discovery.assets.map((asset) =>
        Object.freeze({
          ...(asset.accessToken === undefined
            ? {}
            : { accessSecret: this.#cipher.encrypt(asset.accessToken) }),
          kind: asset.kind,
          name: asset.name,
          providerAssetId: asset.providerAssetId,
          ...(asset.username === undefined ? {} : { username: asset.username }),
        }),
      ),
    );
  }

  async #requiredSecret(
    actor: AuthenticatedActor,
    metaConnectionId: string,
  ): Promise<MetaConnectionSecretRecord> {
    const stored = await this.#repository.findSecret(
      actor.organizationId,
      metaConnectionId,
    );
    if (stored === null) {
      throw new NotFoundException("La conexión Meta no existe o fue revocada.");
    }
    return stored;
  }

  #redirectUri(): string {
    if (!this.#configuration.meta.enabled) {
      throw new ServiceUnavailableException(
        "La integración Meta no está configurada en este entorno.",
      );
    }
    return this.#configuration.meta.credentials.redirectUri;
  }

  #requireAdministrator(actor: AuthenticatedActor): void {
    if (
      !authorizeActor(actor, "connections:manage", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "Sólo un administrador puede gestionar conexiones.",
      );
    }
  }

  #throwProviderFailure(cause: unknown): never {
    if (
      cause instanceof MetaGraphError ||
      cause instanceof MetaGraphUnavailableError ||
      cause instanceof MetaIntegrationDisabledError
    ) {
      throw new ServiceUnavailableException(cause.message);
    }
    throw cause;
  }
}
