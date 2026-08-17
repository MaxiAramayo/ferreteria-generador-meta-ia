import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { SecretValue, type EncryptionKeyRing } from "@aramayo/configuration";
import type { ApiConfiguration } from "@aramayo/configuration/api";
import {
  type AuthenticatedActor,
  type ConsumeMetaOAuthTransactionResult,
  type MetaConnectionMutationResult,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type MetaConnectionSecretRecord,
  type OrganizationRole,
  type SaveMetaConnectionInput,
} from "@aramayo/domain";
import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";

import type {
  MetaGraphPort,
  MetaRemoteCredential,
  MetaRemoteDiscovery,
} from "./meta-graph.port.ts";
import { MetaGraphError } from "./meta-graph.port.ts";
import { MetaConnectionService } from "./meta-connection.service.ts";
import { TokenCipher } from "./token-cipher.ts";

const actor: AuthenticatedActor = Object.freeze({
  displayName: "Administrador",
  email: "admin@example.com",
  membershipId: "10000000-0000-4000-8000-000000000002",
  organizationId: "10000000-0000-4000-8000-000000000001",
  roles: Object.freeze(["admin"] satisfies readonly OrganizationRole[]),
  sessionId: "10000000-0000-4000-8000-000000000003",
  userId: "10000000-0000-4000-8000-000000000004",
});

function keyRing(): EncryptionKeyRing {
  return Object.freeze({
    activeVersion: "v1",
    keys: Object.freeze([
      Object.freeze({
        material: new SecretValue(randomBytes(32).toString("base64")),
        version: "v1",
      }),
    ]),
  });
}

function configuration(ring: EncryptionKeyRing): ApiConfiguration {
  return Object.freeze({
    authenticationSessionTtlSeconds: 43_200,
    databaseUrl: new SecretValue("postgresql://user:password@database/db"),
    environment: "test",
    meta: Object.freeze({
      credentials: Object.freeze({
        appId: "123456789",
        appSecret: new SecretValue("meta-app-secret-value"),
        graphApiVersion: "v26.0",
        redirectUri: "http://localhost:3001/oauth/meta/callback",
      }),
      enabled: true,
    }),
    port: 3001,
    redisUrl: new SecretValue("redis://:password@redis:6379"),
    timeZone: "America/Argentina/Cordoba",
    tokenEncryption: ring,
    trustProxyHops: 0,
    webOrigin: "http://localhost:3000",
  });
}

function connectionRecord(
  overrides: Partial<MetaConnectionRecord> = {},
): MetaConnectionRecord {
  return Object.freeze({
    accountName: "Administrador Meta",
    assets: Object.freeze([
      Object.freeze({
        id: "10000000-0000-4000-8000-000000000011",
        kind: "page",
        name: "Aramayo",
        providerAssetId: "page-1",
        status: "active",
      }),
      Object.freeze({
        id: "10000000-0000-4000-8000-000000000012",
        kind: "instagram_business",
        name: "@ferreteria_aramayo",
        providerAssetId: "ig-1",
        status: "active",
        username: "ferreteria_aramayo",
      }),
    ]),
    createdAt: "2026-08-17T12:00:00.000Z",
    expiresAt: "2026-10-17T12:00:00.000Z",
    grantedPermissions: Object.freeze([
      "instagram_basic",
      "instagram_content_publish",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ]),
    health: "healthy",
    id: "10000000-0000-4000-8000-000000000010",
    lastCheckedAt: "2026-08-17T12:00:00.000Z",
    organizationId: actor.organizationId,
    providerAccountId: "meta-account-1",
    updatedAt: "2026-08-17T12:00:00.000Z",
    version: 1,
    ...overrides,
  });
}

class StubRepository implements MetaConnectionRepository {
  consumeResult: ConsumeMetaOAuthTransactionResult = { status: "consumed" };
  createdTransaction:
    | Parameters<MetaConnectionRepository["createOAuthTransaction"]>[0]
    | undefined;
  saved: SaveMetaConnectionInput | undefined;
  secret: MetaConnectionSecretRecord | null = null;
  current = connectionRecord();

  consumeOAuthTransaction(): Promise<ConsumeMetaOAuthTransactionResult> {
    return Promise.resolve(this.consumeResult);
  }

  createOAuthTransaction(
    input: Parameters<MetaConnectionRepository["createOAuthTransaction"]>[0],
  ): Promise<void> {
    this.createdTransaction = input;
    return Promise.resolve();
  }

  findSecret(): Promise<MetaConnectionSecretRecord | null> {
    return Promise.resolve(this.secret);
  }

  list(): Promise<readonly MetaConnectionRecord[]> {
    return Promise.resolve(Object.freeze([this.current]));
  }

  renew(
    input: Parameters<MetaConnectionRepository["renew"]>[0],
  ): Promise<MetaConnectionMutationResult> {
    this.current = connectionRecord({
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      grantedPermissions: input.grantedPermissions,
      health: input.health,
      version: this.current.version + 1,
    });
    return Promise.resolve({ connection: this.current, status: "updated" });
  }

  revoke(): Promise<MetaConnectionMutationResult> {
    this.current = connectionRecord({
      assets: Object.freeze(
        this.current.assets.map((asset) =>
          Object.freeze({ ...asset, status: "removed" as const }),
        ),
      ),
      health: "revoked",
      revokedAt: "2026-08-17T12:00:00.000Z",
      version: this.current.version + 1,
    });
    return Promise.resolve({ connection: this.current, status: "updated" });
  }

  save(input: SaveMetaConnectionInput): Promise<MetaConnectionRecord> {
    this.saved = input;
    this.current = connectionRecord({
      grantedPermissions: input.grantedPermissions,
      health: input.health,
    });
    return Promise.resolve(this.current);
  }

  updateHealth(
    input: Parameters<MetaConnectionRepository["updateHealth"]>[0],
  ): Promise<MetaConnectionMutationResult> {
    this.current = connectionRecord({
      grantedPermissions: input.grantedPermissions,
      health: input.health,
      version: this.current.version + 1,
    });
    return Promise.resolve({ connection: this.current, status: "updated" });
  }
}

class StubGraph implements MetaGraphPort {
  calls: string[] = [];
  discovery: MetaRemoteDiscovery = Object.freeze({
    accountName: "Administrador Meta",
    assets: Object.freeze([
      Object.freeze({
        accessToken: "page-secret-token",
        kind: "page",
        name: "Aramayo",
        providerAssetId: "page-1",
      }),
      Object.freeze({
        kind: "instagram_business",
        name: "@ferreteria_aramayo",
        providerAssetId: "ig-1",
        username: "ferreteria_aramayo",
      }),
    ]),
    grantedPermissions: connectionRecord().grantedPermissions,
    providerAccountId: "meta-account-1",
  });
  healthFailure: MetaGraphError | null = null;

  authorizationUrl(state: string): string {
    this.calls.push("authorization");
    return `https://www.facebook.com/v26.0/dialog/oauth?state=${state}`;
  }

  discover(): Promise<MetaRemoteDiscovery> {
    this.calls.push("discover");
    return this.healthFailure === null
      ? Promise.resolve(this.discovery)
      : Promise.reject(this.healthFailure);
  }

  exchangeCode(): Promise<MetaRemoteCredential> {
    this.calls.push("exchange");
    return Promise.resolve({ accessToken: "short-secret-token" });
  }

  renew(): Promise<MetaRemoteCredential> {
    this.calls.push("renew");
    return Promise.resolve({
      accessToken: "long-secret-token",
      expiresAt: "2026-10-17T12:00:00.000Z",
    });
  }

  revoke(): Promise<void> {
    this.calls.push("revoke");
    return Promise.resolve();
  }
}

function fixture(): Readonly<{
  cipher: TokenCipher;
  graph: StubGraph;
  repository: StubRepository;
  service: MetaConnectionService;
}> {
  const ring = keyRing();
  const cipher = new TokenCipher(ring);
  const graph = new StubGraph();
  const repository = new StubRepository();
  const service = new MetaConnectionService(
    configuration(ring),
    graph,
    repository,
    cipher,
  );
  return { cipher, graph, repository, service };
}

test("inicio y callback ligan state a la transacción y nunca exponen tokens", async () => {
  const { cipher, graph, repository, service } = fixture();
  const started = await service.start(
    actor,
    new Date("2026-08-17T12:00:00.000Z"),
  );
  assert.ok(repository.createdTransaction);
  assert.equal(repository.createdTransaction.actor.sessionId, actor.sessionId);
  assert.equal(
    repository.createdTransaction.redirectUri,
    "http://localhost:3001/oauth/meta/callback",
  );
  assert.match(repository.createdTransaction.stateHash, /^[a-f0-9]{64}$/u);
  assert.equal(started.authorizationUrl.includes("state="), true);

  const connected = await service.callback(
    actor,
    { code: "authorization-code", state: "A".repeat(43) },
    new Date("2026-08-17T12:01:00.000Z"),
  );
  assert.deepEqual(graph.calls, [
    "authorization",
    "exchange",
    "renew",
    "discover",
  ]);
  assert.equal(repository.saved === undefined, false);
  assert.equal(
    cipher.decrypt(repository.saved?.accessSecret ?? cipher.encrypt("missing")),
    "long-secret-token",
  );
  assert.equal(JSON.stringify(connected).includes("secret-token"), false);
  assert.equal(
    JSON.stringify(repository.saved?.audit).includes("secret-token"),
    false,
  );
});

test("state inválido o repetido falla antes de contactar Meta", async () => {
  const { graph, repository, service } = fixture();
  repository.consumeResult = { status: "invalid" };
  await assert.rejects(
    () => service.callback(actor, { code: "code", state: "B".repeat(43) }),
    ForbiddenException,
  );
  assert.deepEqual(graph.calls, []);
});

test("un rol no administrador no inicia ni revoca conexiones", async () => {
  const { service } = fixture();
  const editor: AuthenticatedActor = Object.freeze({
    ...actor,
    roles: Object.freeze(["editor"] satisfies readonly OrganizationRole[]),
  });
  await assert.rejects(() => service.start(editor), ForbiddenException);
  await assert.rejects(
    () => service.revoke(editor, connectionRecord().id),
    ForbiddenException,
  );
});

test("health distingue token vencido y lo devuelve sin filtrar el error remoto", async () => {
  const { cipher, graph, repository, service } = fixture();
  repository.secret = Object.freeze({
    accessSecret: cipher.encrypt("stored-token"),
    connection: repository.current,
  });
  graph.healthFailure = new MetaGraphError(
    "token_expired",
    "La credencial Meta venció.",
  );
  const response = await service.checkHealth(actor, repository.current.id);
  assert.equal(response.health, "token_expired");
  assert.equal(response.canPublish, false);
});

test("revocar corta publicación aunque Meta no confirme la revocación", async () => {
  const { cipher, graph, repository, service } = fixture();
  repository.secret = Object.freeze({
    accessSecret: cipher.encrypt("stored-token"),
    connection: repository.current,
  });
  graph.revoke = (): Promise<void> =>
    Promise.reject(new ServiceUnavailableException());
  const response = await service.revoke(actor, repository.current.id);
  assert.equal(response.health, "revoked");
  assert.equal(response.canPublish, false);
});
