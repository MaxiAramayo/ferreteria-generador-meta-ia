import assert from "node:assert/strict";
import test from "node:test";

import {
  publicationOrderTopic,
  type MetaConnectionRecord,
  type MetaPublishingAttemptState,
  type OutboxMessageRecord,
  type PublicationOrderJob,
  type PublicationOrderRecord,
  type PublicationOrderRepository,
  type PublicationOrderTargetRecord,
  type PublicationTarget,
} from "@aramayo/domain";

import type { FacebookPublisher } from "./facebook-publisher.service.ts";
import type { InstagramPublisher } from "./instagram-publisher.service.ts";
import { PublicationOrderOutboxTransport } from "./publication-order.transport.ts";
import type {
  PrePublishValidation,
  PrePublishValidatorPort,
} from "./pre-publish.validator.ts";

const organizationId = "org-aramayo";
const orderId = "orden-1";
const mediaAssetId = "media-1";
const checksum = "a".repeat(64);

function targetOf(
  target: PublicationTarget,
  state: MetaPublishingAttemptState = "pending",
): PublicationOrderTargetRecord {
  return Object.freeze({
    publicationTargetId: `${orderId}:${target}`,
    state,
    target,
    updatedAt: "2026-08-19T22:00:00.000Z",
  });
}

function connection(): MetaConnectionRecord {
  return Object.freeze({
    accountName: "Ferretería y Lubricentro Aramayo",
    assets: Object.freeze([
      Object.freeze({
        id: "asset-page",
        kind: "page" as const,
        name: "Page",
        providerAssetId: "page-1",
        status: "active" as const,
      }),
      Object.freeze({
        id: "asset-ig",
        kind: "instagram_business" as const,
        name: "@ferreteria_aramayo",
        providerAssetId: "ig-1",
        status: "active" as const,
      }),
    ]),
    createdAt: "2026-08-18T12:00:00.000Z",
    grantedPermissions: Object.freeze([
      "instagram_basic",
      "instagram_content_publish",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ]),
    health: "healthy" as const,
    id: "conexion-1",
    lastCheckedAt: "2026-08-19T09:00:00.000Z",
    organizationId,
    providerAccountId: "cuenta-1",
    updatedAt: "2026-08-19T09:00:00.000Z",
    version: 5,
  });
}

function snapshot(): unknown {
  return {
    content: { caption: "Copy aprobado de la pieza.", products: [] },
    contentHash: checksum,
    renderedMedia: {
      checksumSha256: checksum,
      height: 1350,
      mediaAssetId,
      mimeType: "image/png",
      width: 1080,
    },
  };
}

class StubOrders implements PublicationOrderRepository {
  blockedWith: Readonly<{ code: string; safeMessage: string }> | null = null;
  cancelled = 0;
  settledWith: string | null = null;
  #targets: PublicationOrderTargetRecord[];
  readonly #cancelledAt: string | undefined;

  constructor(
    targets: readonly PublicationOrderTargetRecord[],
    cancelledAt?: string,
  ) {
    this.#targets = [...targets];
    this.#cancelledAt = cancelledAt;
  }

  /** Simula lo que un publicador dejó escrito en el diario. */
  applyOutcome(
    target: PublicationTarget,
    state: MetaPublishingAttemptState,
  ): void {
    this.#targets = this.#targets.map((entry) =>
      entry.target === target ? { ...entry, state } : entry,
    );
  }

  cancel(): never {
    throw new Error("no usado");
  }

  blockPrePublish(
    input: Readonly<{ code: string; safeMessage: string }>,
  ): Promise<{ status: "blocked"; version: number }> {
    this.blockedWith = input;
    return Promise.resolve(Object.freeze({ status: "blocked", version: 4 }));
  }

  listByPublication(): Promise<readonly PublicationOrderRecord[]> {
    return Promise.reject(new Error("El transporte no lee historial."));
  }

  findById(): Promise<PublicationOrderRecord | null> {
    return Promise.resolve(
      Object.freeze({
        approvalSnapshotId: "snapshot-1",
        ...(this.#cancelledAt === undefined
          ? {}
          : { cancelledAt: this.#cancelledAt }),
        createdAt: "2026-08-19T21:00:00.000Z",
        id: orderId,
        organizationId,
        publicationId: "publicacion-1",
        requestedByMembershipId: "membresia-1",
        targets: Object.freeze([...this.#targets]),
        updatedAt: "2026-08-19T22:00:00.000Z",
      }),
    );
  }

  findJob(): Promise<PublicationOrderJob | null> {
    return Promise.resolve(
      Object.freeze({
        approvalSnapshotId: "snapshot-1",
        contentHash: checksum,
        orderId,
        organizationId,
        publicationId: "publicacion-1",
        publicationStatus: "publishing",
        requestedByMembershipId: "membresia-1",
        snapshot: snapshot(),
        targets: Object.freeze([...this.#targets]),
      }),
    );
  }

  request(): never {
    throw new Error("no usado");
  }

  settle(
    _organizationId: string,
    _orderId: string,
    settledAt: string,
  ): Promise<{ status: "completed"; version: number }> {
    this.settledWith = settledAt;
    return Promise.resolve(Object.freeze({ status: "completed", version: 3 }));
  }
}

class ValidationDouble implements PrePublishValidatorPort {
  readonly #result: PrePublishValidation;

  constructor(result: PrePublishValidation) {
    this.#result = result;
  }

  validate(): Promise<PrePublishValidation> {
    return Promise.resolve(this.#result);
  }
}

function readyValidation(): PrePublishValidation {
  return Object.freeze({
    context: Object.freeze({
      accessToken: "page-token",
      caption: "Copy aprobado de la pieza.",
      connection: connection(),
      media: Object.freeze({
        height: 1350,
        url: "https://res.cloudinary.com/aramayo/pieza.jpg",
        width: 1080,
      }),
    }),
    status: "ready" as const,
  });
}

interface PublisherScript {
  readonly onPublish?: (target: string) => void;
}

function publishers(
  orders: StubOrders,
  script: PublisherScript = {},
): Readonly<{
  calls: string[];
  facebook: FacebookPublisher;
  instagram: InstagramPublisher;
}> {
  const calls: string[] = [];
  const instagram = {
    publish: (command: { target: string }) => {
      calls.push(command.target);
      script.onPublish?.(command.target);
      orders.applyOutcome(command.target as PublicationTarget, "published");
      return Promise.resolve({ status: "published" as const });
    },
  } as unknown as InstagramPublisher;
  const facebook = {
    publish: () => {
      calls.push("facebook_page");
      script.onPublish?.("facebook_page");
      orders.applyOutcome("facebook_page", "published");
      return Promise.resolve({ status: "published" as const });
    },
  } as unknown as FacebookPublisher;
  return { calls, facebook, instagram };
}

function transportFor(
  orders: StubOrders,
  script: PublisherScript = {},
  validation: PrePublishValidation = readyValidation(),
): Readonly<{
  calls: string[];
  transport: PublicationOrderOutboxTransport;
}> {
  const { calls, facebook, instagram } = publishers(orders, script);
  const transport = new PublicationOrderOutboxTransport(
    orders,
    new ValidationDouble(validation),
    instagram,
    facebook,
    { now: (): Date => new Date("2026-08-19T22:30:00.000Z") },
  );
  return { calls, transport };
}

function message(): OutboxMessageRecord {
  return Object.freeze({
    aggregateId: orderId,
    aggregateType: "publication_order",
    attempts: 1,
    availableAt: "2026-08-19T22:00:00.000Z",
    createdAt: "2026-08-19T22:00:00.000Z",
    eventId: "evento-1",
    id: "mensaje-1",
    organizationId,
    payload: { orderId, publicationId: "publicacion-1" },
    status: "pending",
    topic: publicationOrderTopic,
  });
}

test("una orden con dos destinos los publica y se cierra", async () => {
  const orders = new StubOrders([
    targetOf("instagram_feed"),
    targetOf("facebook_page"),
  ]);
  const { calls, transport } = transportFor(orders);
  await transport.deliver(message());

  assert.deepEqual(calls, ["instagram_feed", "facebook_page"]);
  assert.equal(orders.settledWith, "2026-08-19T22:30:00.000Z");
});

test("un fallo en un destino no impide el otro ni altera su resultado", async () => {
  const orders = new StubOrders([
    targetOf("instagram_feed"),
    targetOf("facebook_page"),
  ]);
  const { calls, transport } = transportFor(orders, {
    onPublish: (target) => {
      if (target === "instagram_feed") throw new Error("Instagram explotó.");
    },
  });
  await transport.deliver(message());

  // Instagram rompió y Facebook igual se intentó y salió.
  assert.deepEqual(calls, ["instagram_feed", "facebook_page"]);
  const order = await orders.findById();
  const facebook = order?.targets.find(
    (entry) => entry.target === "facebook_page",
  );
  assert.equal(facebook?.state, "published");
});

test("un destino ya publicado no se vuelve a intentar", async () => {
  const orders = new StubOrders([
    targetOf("instagram_feed", "published"),
    targetOf("facebook_page"),
  ]);
  const { calls, transport } = transportFor(orders);
  await transport.deliver(message());

  assert.deepEqual(calls, ["facebook_page"]);
});

test("una orden cancelada no intenta ningún destino", async () => {
  const orders = new StubOrders(
    [targetOf("instagram_feed"), targetOf("facebook_page")],
    "2026-08-19T22:10:00.000Z",
  );
  const { calls, transport } = transportFor(orders);
  await transport.deliver(message());

  assert.deepEqual(calls, []);
});

test("una orden cancelada conserva lo que ya había salido", async () => {
  const orders = new StubOrders(
    [targetOf("instagram_feed", "published"), targetOf("facebook_page")],
    "2026-08-19T22:10:00.000Z",
  );
  const { calls, transport } = transportFor(orders);
  await transport.deliver(message());

  assert.deepEqual(calls, []);
  const order = await orders.findById();
  assert.equal(order?.targets[0]?.state, "published");
});

test("un desenlace en duda deja la orden abierta", async () => {
  const orders = new StubOrders([
    targetOf("instagram_feed", "published"),
    targetOf("facebook_page", "outcome_unknown"),
  ]);
  const { transport } = transportFor(orders);
  await transport.deliver(message());

  // No se cierra: nadie sabe si Facebook salió.
  assert.equal(orders.settledWith, null);
});

test("un fallo terminal cierra la orden como parcialmente publicada", async () => {
  const orders = new StubOrders([
    targetOf("instagram_feed", "published"),
    targetOf("facebook_page", "failed"),
  ]);
  const { transport } = transportFor(orders);
  await transport.deliver(message());

  assert.equal(orders.settledWith, "2026-08-19T22:30:00.000Z");
});

test("un bloqueo previo no llama a Meta ni consume intentos", async () => {
  const orders = new StubOrders([targetOf("instagram_feed")]);
  const { calls, transport } = transportFor(
    orders,
    {},
    Object.freeze({
      code: "prepublish-media-unavailable",
      safeMessage: "La pieza aprobada ya no está disponible.",
      status: "blocked" as const,
    }),
  );

  await transport.deliver(message());
  assert.deepEqual(calls, []);
  const blocked = orders.blockedWith;
  assert.ok(blocked);
  assert.equal(blocked.code, "prepublish-media-unavailable");
  assert.equal(blocked.safeMessage, "La pieza aprobada ya no está disponible.");
  assert.equal(orders.settledWith, null);
});

test("un tópico ajeno no se consume", async () => {
  const orders = new StubOrders([targetOf("instagram_feed")]);
  const { transport } = transportFor(orders);
  await assert.rejects(
    () =>
      transport.deliver({
        ...message(),
        topic: "content.publication.render-requested",
      }),
    /no tiene un consumidor/u,
  );
});
