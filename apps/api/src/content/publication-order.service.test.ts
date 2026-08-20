import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  OrganizationRole,
  PublicationOrderRecord,
  PublicationOrderRepository,
  ReliableOperationRepository,
  RequestPublicationOrderResult,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import { PublicationOrderService } from "./publication-order.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const publicationId = "20000000-0000-4000-8000-000000000002";
const orderId = "30000000-0000-4000-8000-000000000003";

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

class StubRepository implements PublicationOrderRepository {
  requested: unknown = null;
  cancelledWith: unknown = null;
  #result: RequestPublicationOrderResult;
  #order: PublicationOrderRecord | null;

  constructor(
    result: RequestPublicationOrderResult = {
      orderId,
      publicationId,
      status: "accepted",
      version: 4,
    },
    order: PublicationOrderRecord | null = null,
  ) {
    this.#order = order;
    this.#result = result;
  }

  cancel(input: unknown): Promise<never> {
    this.cancelledWith = input;
    return Promise.resolve(
      this.#order === null
        ? ({ status: "not-found" } as never)
        : ({ order: this.#order, status: "cancelled" } as never),
    );
  }

  findById(): Promise<PublicationOrderRecord | null> {
    return Promise.resolve(this.#order);
  }

  listByPublication(): Promise<readonly PublicationOrderRecord[]> {
    return Promise.resolve(
      this.#order === null ? Object.freeze([]) : Object.freeze([this.#order]),
    );
  }

  findJob(): Promise<null> {
    return Promise.resolve(null);
  }

  request(input: unknown): Promise<RequestPublicationOrderResult> {
    this.requested = input;
    return Promise.resolve(this.#result);
  }

  settle(): Promise<never> {
    throw new Error("no usado");
  }
}

function serviceWith(repository: StubRepository): PublicationOrderService {
  const reliableRepository: ReliableOperationRepository = {
    claim: () => Promise.resolve({ status: "request-conflict" }),
    commit: () => Promise.resolve(false),
    purgeExpired: () => Promise.resolve({ deleted: 0 }),
  };
  return new PublicationOrderService(
    repository,
    new ReliableOperationService(reliableRepository),
  );
}

function order(
  targets: PublicationOrderRecord["targets"],
): PublicationOrderRecord {
  return Object.freeze({
    approvalSnapshotId: "60000000-0000-4000-8000-000000000006",
    createdAt: "2026-08-19T21:00:00.000Z",
    id: orderId,
    organizationId,
    publicationId,
    requestedByMembershipId: "40000000-0000-4000-8000-000000000004",
    targets,
    updatedAt: "2026-08-19T22:00:00.000Z",
  });
}

test("sólo el rol que publica puede pedir una publicación", async () => {
  const repository = new StubRepository();
  const service = serviceWith(repository);
  for (const roles of [
    ["viewer"],
    ["editor"],
    ["approver"],
    ["admin"],
  ] as const) {
    await assert.rejects(
      () =>
        service.request(
          actor(roles),
          publicationId,
          3,
          ["instagram_feed"],
          "idempotency-key-0001",
        ),
      ForbiddenException,
    );
  }
  // Ninguna llamada llegó al repositorio.
  assert.equal(repository.requested, null);
});

test("una publicación aceptada devuelve la orden y el estado publishing", async () => {
  const service = serviceWith(new StubRepository());
  const response = await service.request(
    actor(),
    publicationId,
    3,
    ["instagram_feed", "facebook_page"],
    "idempotency-key-0001",
  );
  assert.deepEqual(response, {
    orderId,
    publicationId,
    status: "publishing",
    version: 4,
  });
});

test("sin clave idempotente no se crea la orden", async () => {
  const repository = new StubRepository();
  await assert.rejects(
    () =>
      serviceWith(repository).request(actor(), publicationId, 3, [
        "instagram_feed",
      ]),
    BadRequestException,
  );
  assert.equal(repository.requested, null);
});

test("una pieza sin aprobar se rechaza en vez de publicarse", async () => {
  const service = serviceWith(new StubRepository({ status: "not-approved" }));
  await assert.rejects(
    () =>
      service.request(
        actor(),
        publicationId,
        3,
        ["instagram_feed"],
        "idempotency-key-0001",
      ),
    (error: unknown) =>
      error instanceof ConflictException &&
      /aprobada con snapshot/u.test(error.message),
  );
});

test("una orden sin destinos válidos se rechaza", async () => {
  const service = serviceWith(new StubRepository({ status: "invalid-target" }));
  await assert.rejects(
    () =>
      service.request(actor(), publicationId, 3, [], "idempotency-key-0001"),
    BadRequestException,
  );
});

test("una versión vieja no publica", async () => {
  const service = serviceWith(new StubRepository({ status: "conflict" }));
  await assert.rejects(
    () =>
      service.request(
        actor(),
        publicationId,
        2,
        ["instagram_feed"],
        "idempotency-key-0001",
      ),
    ConflictException,
  );
});

test("la orden expone el agregado calculado y el detalle por destino", async () => {
  const repository = new StubRepository(
    { status: "not-found" },
    order([
      Object.freeze({
        publicationTargetId: `${orderId}:instagram_feed`,
        remotePostId: "media-1",
        state: "published" as const,
        target: "instagram_feed" as const,
        updatedAt: "2026-08-19T22:00:00.000Z",
      }),
      Object.freeze({
        failureCode: "media-invalid",
        failureDetail: "Facebook rechazó la pieza.",
        failureRetryable: false,
        publicationTargetId: `${orderId}:facebook_page`,
        state: "failed" as const,
        target: "facebook_page" as const,
        updatedAt: "2026-08-19T22:01:00.000Z",
      }),
    ]),
  );
  const response = await serviceWith(repository).find(actor(), orderId);

  assert.equal(response.status, "partially_published");
  // El fallo parcial dice cuál salió y cuál no.
  const [instagram, facebook] = response.targets;
  assert.ok(instagram !== undefined && facebook !== undefined);
  assert.equal(instagram.state, "published");
  assert.equal(instagram.remotePostId, "media-1");
  assert.equal(facebook.state, "failed");
  assert.equal(facebook.failureCode, "media-invalid");
});

test("una orden inexistente no se inventa", async () => {
  await assert.rejects(
    () =>
      serviceWith(new StubRepository({ status: "not-found" })).find(
        actor(),
        orderId,
      ),
    NotFoundException,
  );
});

test("cancelar exige el rol y un motivo, y conserva lo publicado", async () => {
  const published = order([
    Object.freeze({
      publicationTargetId: `${orderId}:instagram_feed`,
      remotePostId: "media-1",
      state: "published" as const,
      target: "instagram_feed" as const,
      updatedAt: "2026-08-19T22:00:00.000Z",
    }),
  ]);
  const repository = new StubRepository({ status: "not-found" }, published);

  await assert.rejects(
    () => serviceWith(repository).cancel(actor(["viewer"]), orderId, "motivo"),
    ForbiddenException,
  );

  const response = await serviceWith(repository).cancel(
    actor(),
    orderId,
    "cancelado-por-operador",
  );
  const [instagram] = response.targets;
  assert.ok(instagram !== undefined);
  assert.equal(instagram.state, "published");
  assert.equal(instagram.remotePostId, "media-1");
});
