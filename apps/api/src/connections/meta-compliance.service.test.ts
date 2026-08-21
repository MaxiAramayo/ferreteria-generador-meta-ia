import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { SecretValue } from "@aramayo/configuration";
import type { ApiConfiguration } from "@aramayo/configuration/api";
import type {
  MetaComplianceRepository,
  MetaConnectionMutationResult,
  MetaConnectionRecord,
  RemoveMetaConnectionFromProviderInput,
} from "@aramayo/domain";
import { BadRequestException } from "@nestjs/common";

import { MetaComplianceService } from "./meta-compliance.service.ts";

const appSecret = "test-meta-app-secret";

const connection: MetaConnectionRecord = Object.freeze({
  accountName: "Administrador Meta",
  assets: Object.freeze([]),
  createdAt: "2026-08-17T12:00:00.000Z",
  grantedPermissions: Object.freeze([]),
  health: "healthy",
  id: "10000000-0000-4000-8000-000000000010",
  lastCheckedAt: "2026-08-17T12:00:00.000Z",
  organizationId: "10000000-0000-4000-8000-000000000001",
  providerAccountId: "meta-account-1",
  updatedAt: "2026-08-17T12:00:00.000Z",
  version: 1,
});

function configuration(): ApiConfiguration {
  return Object.freeze({
    authenticationSessionTtlSeconds: 43_200,
    databaseUrl: new SecretValue("postgresql://user:password@database/db"),
    environment: "test",
    meta: Object.freeze({
      credentials: Object.freeze({
        appId: "123456789",
        appSecret: new SecretValue(appSecret),
        graphApiVersion: "v26.0",
        pageId: "1098765432109876",
        redirectUri: "http://localhost:3001/oauth/meta/callback",
      }),
      enabled: true,
    }),
    port: 3001,
    redisUrl: new SecretValue("redis://:password@redis:6379"),
    timeZone: "America/Argentina/Cordoba",
    tokenEncryption: Object.freeze({ activeVersion: "v1", keys: [] }),
    trustProxyHops: 0,
    webOrigin: "https://staging.content.ferreteriaaramayo.com.ar",
  });
}

function signedRequest(userId: string): string {
  const encodedPayload = Buffer.from(
    JSON.stringify({ algorithm: "HMAC-SHA256", user_id: userId }),
  ).toString("base64url");
  const signature = createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest("base64url");
  return `${signature}.${encodedPayload}`;
}

class StubComplianceRepository implements MetaComplianceRepository {
  connections: readonly MetaConnectionRecord[] = Object.freeze([connection]);
  removals: RemoveMetaConnectionFromProviderInput[] = [];

  findByProviderAccountId(
    providerAccountId: string,
  ): Promise<readonly MetaConnectionRecord[]> {
    return Promise.resolve(
      providerAccountId === connection.providerAccountId
        ? this.connections
        : Object.freeze([]),
    );
  }

  removeFromProvider(
    input: RemoveMetaConnectionFromProviderInput,
  ): Promise<MetaConnectionMutationResult> {
    this.removals.push(input);
    return Promise.resolve({ connection, status: "updated" });
  }
}

test("eliminación firmada borra la conexión y entrega estado público opaco", async () => {
  const repository = new StubComplianceRepository();
  const service = new MetaComplianceService(configuration(), repository);
  const result = await service.deleteData(
    signedRequest(connection.providerAccountId),
    new Date("2026-08-21T19:00:00.000Z"),
  );

  assert.equal(repository.removals.length, 1);
  const removal = repository.removals[0];
  assert.ok(removal);
  assert.equal(removal.reason, "data-deletion");
  assert.equal(removal.audit.actorMembershipId, undefined);
  assert.equal(
    JSON.stringify(removal.audit).includes(connection.providerAccountId),
    false,
  );
  const url = new URL(result.url);
  assert.equal(url.pathname, "/legal/data-deletion");
  assert.equal(url.searchParams.get("code"), result.confirmation_code);
  assert.deepEqual(service.deletionStatus(result.confirmation_code), {
    completedAt: "2026-08-21T19:00:00.000Z",
    status: "completed",
  });
});

test("desautorización firmada corta capacidad sin afirmar borrado", async () => {
  const repository = new StubComplianceRepository();
  const service = new MetaComplianceService(configuration(), repository);
  assert.deepEqual(
    await service.deauthorize(signedRequest(connection.providerAccountId)),
    { status: "acknowledged" },
  );
  assert.equal(repository.removals[0]?.reason, "deauthorization");
});

test("firma inválida falla antes de consultar persistencia", async () => {
  const repository = new StubComplianceRepository();
  const service = new MetaComplianceService(configuration(), repository);
  repository.connections = Object.freeze([]);
  await assert.rejects(
    () => service.deleteData("firma.payload"),
    BadRequestException,
  );
  assert.deepEqual(repository.removals, []);
  assert.deepEqual(service.deletionStatus("firma.payload"), {
    status: "not-found",
  });
});
