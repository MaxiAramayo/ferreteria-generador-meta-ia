import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AuthenticatedActor,
  ClaimIdempotencyInput,
  IdempotencyClaimResult,
  ReliableOperationCommitInput,
  ReliableOperationRepository,
} from "@aramayo/domain";

import { ReliableOperationService } from "./reliable-operation.service.ts";

const actor: AuthenticatedActor = Object.freeze({
  displayName: "Editora Aramayo",
  email: "editora@aramayo.invalid",
  membershipId: "10000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000002",
  roles: Object.freeze(["editor"] as const),
  sessionId: "10000000-0000-4000-8000-000000000003",
  userId: "10000000-0000-4000-8000-000000000004",
});

class FakeReliableOperationRepository implements ReliableOperationRepository {
  claimInput: ClaimIdempotencyInput | undefined;
  claimResult: IdempotencyClaimResult = {
    recordId: "10000000-0000-4000-8000-000000000005",
    status: "claimed",
  };
  commitInput: ReliableOperationCommitInput | undefined;

  claim(input: ClaimIdempotencyInput): Promise<IdempotencyClaimResult> {
    this.claimInput = input;
    return Promise.resolve(this.claimResult);
  }

  commit(input: ReliableOperationCommitInput): Promise<boolean> {
    this.commitInput = input;
    return Promise.resolve(true);
  }

  purgeExpired(): Promise<Readonly<{ deleted: number }>> {
    return Promise.resolve({ deleted: 0 });
  }
}

test("prepara un hash canónico sin persistir la clave original", () => {
  const repository = new FakeReliableOperationRepository();
  const service = new ReliableOperationService(repository);
  const at = new Date("2026-07-28T12:00:00.000Z");
  const first = service.prepare(
    actor,
    "content.publication:create",
    "client-generated-key-0000",
    { content: { caption: "Consulta" }, title: "Taladro" },
    at,
  );
  const reordered = service.prepare(
    actor,
    "content.publication:create",
    "client-generated-key-0000",
    { title: "Taladro", content: { caption: "Consulta" } },
    at,
  );

  assert.equal(first.claim.requestHash, reordered.claim.requestHash);
  assert.notEqual(first.claim.keyHash, "client-generated-key-0000");
  assert.match(first.claim.keyHash, /^[a-f0-9]{64}$/u);
  assert.equal(repository.claimInput, undefined);
});

test("reclama por actor y persiste sólo el hash de la clave", async () => {
  const repository = new FakeReliableOperationRepository();
  const service = new ReliableOperationService(repository);
  const rawKey = "client-generated-key-0001";

  const result = await service.begin(
    actor,
    "content.publication-draft:create",
    rawKey,
    "a".repeat(64),
    new Date("2026-07-28T12:00:00.000Z"),
  );

  assert.equal(result.status, "claimed");
  if (repository.claimInput === undefined) {
    assert.fail("El servicio no reclamó la clave en persistencia.");
  }
  assert.notEqual(repository.claimInput.keyHash, rawKey);
  assert.match(repository.claimInput.keyHash, /^[a-f0-9]{64}$/u);
  assert.equal(repository.claimInput.actorMembershipId, actor.membershipId);
  assert.equal(repository.claimInput.organizationId, actor.organizationId);
});

test("completa auditoría, respuesta y outbox sin copiar la clave original", async () => {
  const repository = new FakeReliableOperationRepository();
  const service = new ReliableOperationService(repository);
  const begun = await service.begin(
    actor,
    "content.publication-draft:create",
    "client-generated-key-0002",
    "b".repeat(64),
    new Date("2026-07-28T12:00:00.000Z"),
  );
  if (begun.status !== "claimed") {
    assert.fail("La operación de prueba debía ser reclamada.");
  }

  assert.equal(
    await service.complete({
      audit: {
        entityId: "publication-1",
        entityType: "publication",
        metadata: { publicationId: "publication-1" },
        outcome: "success",
      },
      claim: begun.claim,
      occurredAt: "2026-07-28T12:01:00.000Z",
      outbox: [
        {
          aggregateId: "publication-1",
          aggregateType: "publication",
          payload: { publicationId: "publication-1" },
          topic: "content.publication.created:v1",
        },
      ],
      responseBody: { publicationId: "publication-1", version: 1 },
      responseStatus: 201,
    }),
    true,
  );
  if (repository.commitInput === undefined) {
    assert.fail("El servicio no entregó el commit confiable.");
  }
  assert.equal(
    repository.commitInput.audit.actorMembershipId,
    actor.membershipId,
  );
  assert.equal(repository.commitInput.outbox.length, 1);
  const outboxMessage = repository.commitInput.outbox[0];
  if (outboxMessage === undefined) {
    assert.fail("El servicio perdió el mensaje outbox.");
  }
  assert.match(outboxMessage.eventId, /^[a-f0-9-]{36}$/u);
});

test("rechaza metadata sensible antes de alcanzar persistencia", async () => {
  const repository = new FakeReliableOperationRepository();
  const service = new ReliableOperationService(repository);
  const begun = await service.begin(
    actor,
    "content.publication-draft:create",
    "client-generated-key-0003",
    "c".repeat(64),
    new Date("2026-07-28T12:00:00.000Z"),
  );
  if (begun.status !== "claimed") {
    assert.fail("La operación de prueba debía ser reclamada.");
  }

  assert.throws(() =>
    service.complete({
      audit: {
        entityType: "publication",
        metadata: { accessToken: "no-persistir" },
        outcome: "failure",
      },
      claim: begun.claim,
      occurredAt: "2026-07-28T12:01:00.000Z",
      outbox: [],
      responseBody: { errorCode: "safe-error" },
      responseStatus: 409,
    }),
  );
  assert.equal(repository.commitInput, undefined);
});
