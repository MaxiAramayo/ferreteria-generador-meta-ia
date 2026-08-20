import assert from "node:assert/strict";
import test from "node:test";

import {
  publicationManualActions,
  type ApplyPublicationManualActionInput,
  type ApplyPublicationManualActionResult,
  type AuthenticatedActor,
  type OrganizationRole,
  type PublicationManualActionRecord,
  type PublicationManualReason,
  type PublicationRetryRepository,
} from "@aramayo/domain";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { PublicationManualActionService } from "./publication-manual-action.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const publicationId = "20000000-0000-4000-8000-000000000002";
const orderId = "30000000-0000-4000-8000-000000000003";
const publicationTargetId = `${orderId}:facebook_page`;

function actor(
  roles: readonly OrganizationRole[] = ["publisher"],
): AuthenticatedActor {
  return Object.freeze({
    displayName: "Persona que publica",
    email: "publica@aramayo.test",
    membershipId: "40000000-0000-4000-8000-000000000004",
    organizationId,
    roles,
    sessionId: "50000000-0000-4000-8000-000000000005",
    userId: "70000000-0000-4000-8000-000000000007",
  });
}

function stopped(
  reason: PublicationManualReason,
): PublicationManualActionRecord {
  return Object.freeze({
    actions: publicationManualActions(reason),
    attempts: 5,
    failureCode: "provider-error" as const,
    failureDetail: "Meta no respondió.",
    orderId,
    publicationId,
    publicationTargetId,
    reason,
    state: "failed" as const,
    target: "facebook_page" as const,
    updatedAt: "2026-08-20T12:00:00.000Z",
  });
}

class StubRepository {
  applied: ApplyPublicationManualActionInput | null = null;
  listedFor: string | null = null;
  result: ApplyPublicationManualActionResult = Object.freeze({
    status: "applied" as const,
  });
  #records: readonly PublicationManualActionRecord[];

  constructor(records: readonly PublicationManualActionRecord[]) {
    this.#records = records;
  }

  pendingManualActions(
    organization: string,
  ): Promise<readonly PublicationManualActionRecord[]> {
    this.listedFor = organization;
    return Promise.resolve(this.#records);
  }

  applyManualAction(
    input: ApplyPublicationManualActionInput,
  ): Promise<ApplyPublicationManualActionResult> {
    this.applied = input;
    return Promise.resolve(this.result);
  }
}

function serviceFor(
  records: readonly PublicationManualActionRecord[],
): Readonly<{
  repository: StubRepository;
  service: PublicationManualActionService;
}> {
  const repository = new StubRepository(records);
  return Object.freeze({
    repository,
    service: new PublicationManualActionService(
      repository as unknown as PublicationRetryRepository,
    ),
  });
}

test("la alerta lista los destinos detenidos con sus acciones seguras", async () => {
  const { repository, service } = serviceFor([stopped("attempts-exhausted")]);

  const response = await service.list(actor());

  assert.equal(repository.listedFor, organizationId);
  assert.equal(response.items.length, 1);
  const [item] = response.items;
  assert.ok(item);
  assert.equal(item.reason, "attempts-exhausted");
  assert.equal(item.attempts, 5);
  assert.deepEqual([...item.actions], ["retry", "abandon"]);
});

test("un desenlace en duda se ofrece sin la acción de reintentar", async () => {
  // La regla vive en el servidor: el panel muestra lo que llega y no deduce
  // nada, porque deducirlo la pondría en dos lugares.
  const { service } = serviceFor([stopped("outcome-unresolved")]);

  const response = await service.list(actor());

  const [item] = response.items;
  assert.ok(item);
  assert.deepEqual([...item.actions], ["reconcile", "abandon"]);
  assert.equal(item.actions.includes("retry"), false);
});

test("actuar sin el permiso de publicar queda prohibido", async () => {
  const { repository, service } = serviceFor([stopped("attempts-exhausted")]);

  await assert.rejects(
    service.apply(actor(["editor"]), publicationTargetId, "retry"),
    ForbiddenException,
  );
  await assert.rejects(service.list(actor(["viewer"])), ForbiddenException);
  // Ni siquiera llegó al repositorio.
  assert.equal(repository.applied, null);
});

test("una acción aplicada devuelve la alerta ya actualizada", async () => {
  const { repository, service } = serviceFor([]);

  const response = await service.apply(actor(), publicationTargetId, "abandon");

  const applied = repository.applied;
  assert.ok(applied);
  assert.equal(applied.action, "abandon");
  assert.equal(applied.publicationTargetId, publicationTargetId);
  assert.equal(applied.organizationId, organizationId);
  // Quien actúa ve el resultado sin tener que volver a pedir la lista.
  assert.deepEqual([...response.items], []);
});

test("una acción que el motivo no admite se rechaza sin castigar al permiso", async () => {
  const { repository, service } = serviceFor([]);
  repository.result = Object.freeze({ status: "not-allowed" as const });

  // 422 y no 403: el permiso está, lo que no corresponde es la acción sobre
  // este destino en este momento.
  await assert.rejects(
    service.apply(actor(), publicationTargetId, "retry"),
    UnprocessableEntityException,
  );
});

test("un destino que cambió mientras alguien decidía informa conflicto", async () => {
  const { repository, service } = serviceFor([]);
  repository.result = Object.freeze({ status: "conflict" as const });

  await assert.rejects(
    service.apply(actor(), publicationTargetId, "retry"),
    ConflictException,
  );
});

test("un destino inexistente no se confunde con uno no permitido", async () => {
  const { repository, service } = serviceFor([]);
  repository.result = Object.freeze({ status: "not-found" as const });

  await assert.rejects(
    service.apply(actor(), publicationTargetId, "retry"),
    NotFoundException,
  );
});
