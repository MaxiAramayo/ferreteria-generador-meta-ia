import assert from "node:assert/strict";
import test from "node:test";

import {
  MetaPublishingError,
  type MetaPublishingAttemptJournal,
  type MetaPublishingAttemptRecord,
  type MetaPublishingAttemptScope,
  type MetaPublishingAttemptWriteResult,
  type InstagramContainerReport,
  type InstagramContainerRequest,
  type InstagramContainerState,
  type InstagramCreatedContainer,
  type InstagramPublishRequest,
  type InstagramPublishedMedia,
  type InstagramPublishingPort,
  type InstagramPublishingQuota,
  type MetaConnectionRecord,
  type PublicMediaProbePort,
  type PublicMediaProbeResult,
} from "@aramayo/domain";

import { InMemoryMetaPublishingAttemptJournal } from "./in-memory-publishing-attempts.ts";
import {
  InstagramPublisher,
  type InstagramPublishOutcome,
  type PublishToInstagramCommand,
} from "./instagram-publisher.service.ts";

const organizationId = "org-aramayo";
const instagramAssetId = "17841400000000000";
const imageUrl =
  "https://res.cloudinary.com/m73l9k4c/image/upload/v3/aramayo-posts/staging/pieza.jpg";

function connection(
  overrides: Partial<MetaConnectionRecord> = {},
): MetaConnectionRecord {
  return Object.freeze({
    accountName: "Ferretería y Lubricentro Aramayo",
    assets: Object.freeze([
      Object.freeze({
        id: "asset-page",
        kind: "page" as const,
        name: "Ferretería y Lubricentro Aramayo",
        providerAssetId: "1098765432109876",
        status: "active" as const,
      }),
      Object.freeze({
        id: "asset-instagram",
        kind: "instagram_business" as const,
        name: "@ferreteria_aramayo",
        providerAssetId: instagramAssetId,
        status: "active" as const,
        username: "ferreteria_aramayo",
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
    id: "meta-connection-1",
    lastCheckedAt: "2026-08-19T09:00:00.000Z",
    organizationId,
    providerAccountId: "provider-account",
    updatedAt: "2026-08-19T09:00:00.000Z",
    version: 5,
    ...overrides,
  });
}

function command(
  overrides: Partial<PublishToInstagramCommand> = {},
): PublishToInstagramCommand {
  return Object.freeze({
    accessToken: "page-token",
    attemptId: "attempt-1",
    connection: connection(),
    media: Object.freeze({ height: 1350, url: imageUrl, width: 1080 }),
    organizationId,
    publicationTargetId: "target-feed-1",
    target: "instagram_feed" as const,
    ...overrides,
  });
}

interface GraphScript {
  readonly containerId?: string;
  readonly createContainer?: () => never;
  readonly publishContainer?: () => never;
  readonly quota?: InstagramPublishingQuota;
  readonly readContainer?: () => never;
  readonly states?: readonly InstagramContainerState[];
}

class ScriptedInstagramGraph implements InstagramPublishingPort {
  readonly calls: string[] = [];
  readonly containers: InstagramContainerRequest[] = [];
  #remaining: InstagramContainerState[];
  readonly #script: GraphScript;

  constructor(script: GraphScript = {}) {
    this.#remaining = [...(script.states ?? ["finished"])];
    this.#script = script;
  }

  createContainer(
    request: InstagramContainerRequest,
  ): Promise<InstagramCreatedContainer> {
    this.calls.push("createContainer");
    this.containers.push(request);
    this.#script.createContainer?.();
    return Promise.resolve({
      containerId: this.#script.containerId ?? "container-1",
    });
  }

  readContainer(): Promise<InstagramContainerReport> {
    this.calls.push("readContainer");
    this.#script.readContainer?.();
    const state = this.#remaining.shift() ?? "finished";
    if (this.#remaining.length === 0) this.#remaining = [state];
    return Promise.resolve({ state });
  }

  publishContainer(
    request: InstagramPublishRequest,
  ): Promise<InstagramPublishedMedia> {
    this.calls.push(`publishContainer:${request.containerId}`);
    this.#script.publishContainer?.();
    return Promise.resolve({ mediaId: "media-1" });
  }

  readPublishingQuota(): Promise<InstagramPublishingQuota> {
    this.calls.push("readPublishingQuota");
    return Promise.resolve(
      this.#script.quota ?? {
        quotaDurationSeconds: 86_400,
        quotaTotal: 50,
        quotaUsage: 3,
      },
    );
  }
}

class ScriptedProbe implements PublicMediaProbePort {
  calls = 0;
  readonly #result: PublicMediaProbeResult;

  constructor(
    result: PublicMediaProbeResult = {
      byteSize: 742_183,
      mimeType: "image/jpeg",
      status: "reachable",
    },
  ) {
    this.#result = result;
  }

  probe(): Promise<PublicMediaProbeResult> {
    this.calls += 1;
    return Promise.resolve(this.#result);
  }
}

/** Diario en el que otro trabajador escribe justo después de la lectura. */
class ContendedJournal implements MetaPublishingAttemptJournal {
  readonly #delegate: MetaPublishingAttemptJournal;
  readonly #interleave: () => void;

  constructor(delegate: MetaPublishingAttemptJournal, interleave: () => void) {
    this.#delegate = delegate;
    this.#interleave = interleave;
  }

  async find(
    scope: MetaPublishingAttemptScope,
  ): Promise<MetaPublishingAttemptRecord | null> {
    const found = await this.#delegate.find(scope);
    this.#interleave();
    return found;
  }

  save(
    record: MetaPublishingAttemptRecord,
  ): Promise<MetaPublishingAttemptWriteResult> {
    return this.#delegate.save(record);
  }
}

function publisherWith(
  graph: ScriptedInstagramGraph,
  journal: MetaPublishingAttemptJournal,
  probe: ScriptedProbe = new ScriptedProbe(),
): InstagramPublisher {
  let clock = Date.parse("2026-08-19T10:00:00.000Z");
  return new InstagramPublisher(graph, journal, probe, {
    now: () => clock,
    pollIntervalMilliseconds: 1_000,
    processingDeadlineMilliseconds: 10_000,
    // El reloj avanza con cada espera: así el plazo se agota igual que en
    // producción, sin que la prueba tenga que dormir de verdad.
    sleep: (milliseconds: number): Promise<void> => {
      clock += milliseconds;
      return Promise.resolve();
    },
  });
}

function failureCodeOf(outcome: InstagramPublishOutcome): string {
  assert.equal(outcome.status, "failed");
  return outcome.failure.code;
}

test("una pieza válida crea contenedor, espera el procesamiento y publica", async () => {
  const graph = new ScriptedInstagramGraph({
    states: ["in_progress", "in_progress", "finished"],
  });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published");
  assert.equal(outcome.mediaId, "media-1");
  assert.deepEqual(graph.calls, [
    "readPublishingQuota",
    "createContainer",
    "readContainer",
    "readContainer",
    "readContainer",
    "publishContainer:container-1",
  ]);
  // El contenedor queda guardado antes de publicar y el identificador remoto
  // después: los dos sobreviven al intento.
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.state, "published");
  assert.equal(attempt.stagedMediaId, "container-1");
  assert.equal(attempt.remotePostId, "media-1");
  assert.equal(attempt.sequence, 2);
});

test("repetir el comando sobre un éxito confirmado no llama a Meta", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const publisher = publisherWith(graph, journal);

  const first = await publisher.publish(command());
  assert.equal(first.status, "published");
  const callsAfterFirst = graph.calls.length;

  const second = await publisher.publish(command());
  assert.equal(second.status, "already-published");
  assert.equal(second.mediaId, "media-1");
  assert.equal(graph.calls.length, callsAfterFirst);
  assert.equal(journal.records.length, 1);
});

test("un timeout después de crear el contenedor conserva su identificador", async () => {
  const graph = new ScriptedInstagramGraph({
    publishContainer: (): never => {
      throw new MetaPublishingError(
        "request-timeout",
        "Meta no respondió a tiempo.",
        true,
      );
    },
  });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "request-timeout");
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.state, "failed");
  assert.equal(attempt.stagedMediaId, "container-1");
});

test("el reintento reconcilia por estado y no crea una segunda publicación", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    stagedMediaId: "container-1",
    failure: {
      code: "request-timeout",
      detail: "Meta no respondió a tiempo.",
      retryable: true,
    },
    organizationId,
    publicationTargetId: "target-feed-1",
    sequence: 2,
    state: "failed",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  // Meta informa que ese contenedor ya fue publicado: el intento anterior sí
  // llegó, aunque nunca lo supo.
  const graph = new ScriptedInstagramGraph({ states: ["published"] });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published-unconfirmed");
  assert.ok(!graph.calls.some((call) => call.startsWith("publishContainer")));
  assert.ok(!graph.calls.includes("createContainer"));
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.state, "published_unconfirmed");
  assert.equal(attempt.stagedMediaId, "container-1");
});

test("un intento sin confirmar tampoco vuelve a publicar", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    stagedMediaId: "container-1",
    organizationId,
    publicationTargetId: "target-feed-1",
    sequence: 3,
    state: "published_unconfirmed",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedInstagramGraph();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published-unconfirmed");
  assert.deepEqual(graph.calls, []);
});

test("el reintento reutiliza el contenedor vigente en vez de gastar otro", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    stagedMediaId: "container-1",
    failure: {
      code: "provider-error",
      detail: "Meta no pudo responder.",
      retryable: true,
    },
    organizationId,
    publicationTargetId: "target-feed-1",
    sequence: 2,
    state: "failed",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedInstagramGraph({ states: ["finished"] });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published");
  assert.ok(!graph.calls.includes("createContainer"));
  assert.ok(!graph.calls.includes("readPublishingQuota"));
  assert.ok(graph.calls.includes("publishContainer:container-1"));
});

test("un contenedor vencido se descarta para que el reintento cree uno nuevo", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    stagedMediaId: "container-viejo",
    organizationId,
    publicationTargetId: "target-feed-1",
    sequence: 1,
    state: "media_staged",
    updatedAt: "2026-08-18T09:00:00.000Z",
  });
  const graph = new ScriptedInstagramGraph({ states: ["expired"] });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "staged-media-expired");
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.stagedMediaId, undefined);
});

test("un contenedor con error de procesamiento no se reintenta con el mismo", async () => {
  const graph = new ScriptedInstagramGraph({ states: ["error"] });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "processing-failed");
  assert.equal(outcome.status === "failed" && outcome.failure.retryable, false);
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.stagedMediaId, undefined);
});

test("agotar el plazo de procesamiento conserva el contenedor", async () => {
  const graph = new ScriptedInstagramGraph({ states: ["in_progress"] });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "processing-timeout");
  assert.equal(outcome.status === "failed" && outcome.failure.retryable, true);
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.stagedMediaId, "container-1");
  assert.ok(!graph.calls.some((call) => call.startsWith("publishContainer")));
});

test("una pieza del formato equivocado no gasta ni la sonda ni una llamada", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const probe = new ScriptedProbe();
  const outcome = await publisherWith(graph, journal, probe).publish(
    command({ media: { height: 1920, url: imageUrl, width: 1080 } }),
  );

  assert.equal(failureCodeOf(outcome), "validation-failed");
  assert.equal(probe.calls, 0);
  assert.deepEqual(graph.calls, []);
});

test("una historia con pie se rechaza antes de llamar a Meta", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(
    command({
      caption: "Texto que Instagram descartaría",
      media: { height: 1920, url: imageUrl, width: 1080 },
      target: "instagram_story",
    }),
  );

  assert.equal(failureCodeOf(outcome), "validation-failed");
  assert.deepEqual(graph.calls, []);
});

test("una URL inaccesible se detecta antes de gastar el contenedor", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(
    graph,
    journal,
    new ScriptedProbe({ status: "unreachable" }),
  ).publish(command());

  assert.equal(failureCodeOf(outcome), "media-unreachable");
  assert.equal(outcome.status === "failed" && outcome.failure.retryable, true);
  assert.deepEqual(graph.calls, []);
});

test("una entrega que no es JPEG se rechaza aunque el activo diga otra cosa", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(
    graph,
    journal,
    new ScriptedProbe({
      byteSize: 900_000,
      mimeType: "image/png",
      status: "reachable",
    }),
  ).publish(command());

  assert.equal(failureCodeOf(outcome), "validation-failed");
  assert.deepEqual(graph.calls, []);
});

test("la cuota agotada frena antes de crear el contenedor", async () => {
  const graph = new ScriptedInstagramGraph({
    quota: { quotaDurationSeconds: 86_400, quotaTotal: 50, quotaUsage: 50 },
  });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "publishing-limit-reached");
  assert.equal(outcome.status === "failed" && outcome.failure.retryable, false);
  assert.deepEqual(graph.calls, ["readPublishingQuota"]);
});

test("una conexión sin salud, sin permisos o sin activo no publica", async () => {
  for (const broken of [
    connection({ health: "token_expired" }),
    connection({ grantedPermissions: Object.freeze(["instagram_basic"]) }),
    connection({
      assets: Object.freeze([
        Object.freeze({
          id: "asset-page",
          kind: "page" as const,
          name: "Page",
          providerAssetId: "1098765432109876",
          status: "active" as const,
        }),
      ]),
    }),
    connection({ organizationId: "org-ajena" }),
  ]) {
    const graph = new ScriptedInstagramGraph();
    const journal = new InMemoryMetaPublishingAttemptJournal();
    const outcome = await publisherWith(graph, journal).publish(
      command({ connection: broken }),
    );
    assert.equal(failureCodeOf(outcome), "permission-denied");
    assert.deepEqual(graph.calls, []);
  }
});

test("un activo de Instagram removido no se usa como destino", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const removed = connection();
  const outcome = await publisherWith(graph, journal).publish(
    command({
      connection: connection({
        assets: Object.freeze(
          removed.assets.map((asset) =>
            asset.kind === "instagram_business"
              ? { ...asset, status: "removed" as const }
              : asset,
          ),
        ),
      }),
    }),
  );

  assert.equal(failureCodeOf(outcome), "permission-denied");
  assert.deepEqual(graph.calls, []);
});

test("el contenedor se dirige a la cuenta que declara la conexión", async () => {
  const graph = new ScriptedInstagramGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  await publisherWith(graph, journal).publish(command());
  const [request] = graph.containers;
  assert.ok(request !== undefined);
  assert.equal(request.instagramAssetId, instagramAssetId);
  assert.equal(request.imageUrl, imageUrl);
});

test("otro trabajador que escribe primero deja este intento en conflicto", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  // Entre la lectura y la escritura de este publicador, otro trabajador toma
  // el mismo destino y adelanta la secuencia. Es la carrera real entre dos
  // consumidores del mismo mensaje.
  const contended = new ContendedJournal(journal, () => {
    journal.seed({
      attemptId: "attempt-otro",
      stagedMediaId: "container-otro",
      organizationId,
      publicationTargetId: "target-feed-1",
      sequence: 1,
      state: "media_staged",
      updatedAt: "2026-08-19T09:59:30.000Z",
    });
  });

  const graph = new ScriptedInstagramGraph({ states: ["finished"] });
  const outcome = await publisherWith(graph, contended).publish(command());

  assert.equal(outcome.status, "conflict");
  // El publicador se detiene en cuanto pierde la carrera: no llega a publicar.
  assert.deepEqual(graph.calls, ["readPublishingQuota", "createContainer"]);
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.attemptId, "attempt-otro");
});

test("perder la conexión no borra el contenedor que quizá ya se publicó", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    stagedMediaId: "container-1",
    organizationId,
    publicationTargetId: "target-feed-1",
    sequence: 1,
    state: "media_staged",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedInstagramGraph();
  const outcome = await publisherWith(graph, journal).publish(
    command({ connection: connection({ health: "token_expired" }) }),
  );

  assert.equal(failureCodeOf(outcome), "permission-denied");
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  // Si se hubiera borrado, reparar la conexión haría que el reintento creara
  // otro contenedor y publicara de nuevo lo que quizá ya salió.
  assert.equal(attempt.stagedMediaId, "container-1");
});

test("un intento publicado sin identificador no se vuelve a publicar", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    organizationId,
    publicationTargetId: "target-feed-1",
    sequence: 2,
    state: "published",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedInstagramGraph();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published-unconfirmed");
  assert.deepEqual(graph.calls, []);
});
