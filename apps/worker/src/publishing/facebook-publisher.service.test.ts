import assert from "node:assert/strict";
import test from "node:test";

import {
  MetaPublishingError,
  type FacebookPagePost,
  type FacebookPagePostRequest,
  type FacebookPublishingPort,
  type FacebookStagePhotoRequest,
  type FacebookStagedPhoto,
  type FacebookStagedPhotoReport,
  type MetaConnectionRecord,
  type MetaPublishingAttemptJournal,
  type PublicMediaProbePort,
  type PublicMediaProbeResult,
} from "@aramayo/domain";

import {
  FacebookPublisher,
  type FacebookPublishOutcome,
  type PublishToFacebookCommand,
} from "./facebook-publisher.service.ts";
import { InMemoryMetaPublishingAttemptJournal } from "./in-memory-publishing-attempts.ts";

const organizationId = "org-aramayo";
const pageAssetId = "1098765432109876";
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
        providerAssetId: pageAssetId,
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
  overrides: Partial<PublishToFacebookCommand> = {},
): PublishToFacebookCommand {
  return Object.freeze({
    accessToken: "page-token",
    attemptId: "attempt-1",
    connection: connection(),
    copy: "Filtros Wega en stock. Consultanos por WhatsApp.",
    media: Object.freeze({ height: 1350, url: imageUrl, width: 1080 }),
    organizationId,
    publicationTargetId: "target-facebook-1",
    ...overrides,
  });
}

interface GraphScript {
  readonly createPagePost?: () => never;
  readonly permalink?: string | null;
  readonly stagePhoto?: () => never;
  readonly stagedPostId?: string;
}

class ScriptedFacebookGraph implements FacebookPublishingPort {
  readonly calls: string[] = [];
  readonly posts: FacebookPagePostRequest[] = [];
  readonly #script: GraphScript;

  constructor(script: GraphScript = {}) {
    this.#script = script;
  }

  stagePhoto(request: FacebookStagePhotoRequest): Promise<FacebookStagedPhoto> {
    this.calls.push(`stagePhoto:${request.pageAssetId}`);
    this.#script.stagePhoto?.();
    return Promise.resolve({ photoId: "photo-1" });
  }

  createPagePost(request: FacebookPagePostRequest): Promise<FacebookPagePost> {
    this.calls.push(`createPagePost:${request.stagedPhotoId}`);
    this.posts.push(request);
    this.#script.createPagePost?.();
    return Promise.resolve({ postId: "post-1" });
  }

  readStagedPhoto(photoId: string): Promise<FacebookStagedPhotoReport> {
    this.calls.push(`readStagedPhoto:${photoId}`);
    return Promise.resolve(
      this.#script.stagedPostId === undefined
        ? {}
        : { postId: this.#script.stagedPostId },
    );
  }

  readPermalink(postId: string): Promise<string | null> {
    this.calls.push(`readPermalink:${postId}`);
    return Promise.resolve(
      this.#script.permalink === undefined
        ? "https://www.facebook.com/aramayo/posts/1"
        : this.#script.permalink,
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

function publisherWith(
  graph: ScriptedFacebookGraph,
  journal: MetaPublishingAttemptJournal,
  probe: ScriptedProbe = new ScriptedProbe(),
): FacebookPublisher {
  return new FacebookPublisher(graph, journal, probe, {
    now: () => Date.parse("2026-08-19T10:00:00.000Z"),
  });
}

function failureCodeOf(outcome: FacebookPublishOutcome): string {
  assert.equal(outcome.status, "failed");
  return outcome.failure.code;
}

test("la pieza se sube sin publicar, después se publica con su copy", async () => {
  const graph = new ScriptedFacebookGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published");
  assert.equal(outcome.postId, "post-1");
  assert.equal(outcome.permalink, "https://www.facebook.com/aramayo/posts/1");
  assert.deepEqual(graph.calls, [
    `stagePhoto:${pageAssetId}`,
    "createPagePost:photo-1",
    "readPermalink:post-1",
  ]);
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.state, "published");
  assert.equal(attempt.stagedMediaId, "photo-1");
  assert.equal(attempt.remotePostId, "post-1");
  assert.equal(
    attempt.remotePermalink,
    "https://www.facebook.com/aramayo/posts/1",
  );
});

test("repetir el comando sobre un éxito confirmado no llama a Meta", async () => {
  const graph = new ScriptedFacebookGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const publisher = publisherWith(graph, journal);

  const first = await publisher.publish(command());
  assert.equal(first.status, "published");
  const callsAfterFirst = graph.calls.length;

  const second = await publisher.publish(command());
  assert.equal(second.status, "already-published");
  assert.equal(second.postId, "post-1");
  // El enlace sale del registro: volver a leerlo gastaría una llamada por algo
  // que ya no cambia.
  assert.equal(second.permalink, "https://www.facebook.com/aramayo/posts/1");
  assert.equal(graph.calls.length, callsAfterFirst);
  assert.equal(journal.records.length, 1);
});

test("un enlace que Meta no entrega no pone en duda la publicación", async () => {
  const graph = new ScriptedFacebookGraph({ permalink: null });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published");
  assert.equal(outcome.postId, "post-1");
  assert.equal(outcome.permalink, undefined);
});

test("el reintento pregunta si la foto preparada ya tiene publicación", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    organizationId,
    publicationTargetId: "target-facebook-1",
    sequence: 1,
    stagedMediaId: "photo-1",
    state: "media_staged",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedFacebookGraph({ stagedPostId: "post-previo" });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published");
  assert.equal(outcome.postId, "post-previo");
  // Reconcilió: no volvió a subir la foto ni creó una segunda publicación.
  assert.ok(!graph.calls.some((call) => call.startsWith("stagePhoto")));
  assert.ok(!graph.calls.some((call) => call.startsWith("createPagePost")));
});

test("si la foto preparada no declara publicación, se publica con ella", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    organizationId,
    publicationTargetId: "target-facebook-1",
    sequence: 1,
    stagedMediaId: "photo-1",
    state: "media_staged",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedFacebookGraph();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "published");
  assert.ok(!graph.calls.some((call) => call.startsWith("stagePhoto")));
  assert.ok(graph.calls.includes("createPagePost:photo-1"));
});

test("un timeout al publicar deja el desenlace en duda y no reintenta solo", async () => {
  const graph = new ScriptedFacebookGraph({
    createPagePost: (): never => {
      throw new MetaPublishingError(
        "request-timeout",
        "Meta no respondió a tiempo.",
        true,
      );
    },
  });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "outcome-unknown");
  assert.equal(outcome.stagedPhotoId, "photo-1");
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.state, "outcome_unknown");
  assert.equal(attempt.stagedMediaId, "photo-1");
});

test("un desenlace desconocido no se reintenta ni se declara publicado", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    organizationId,
    publicationTargetId: "target-facebook-1",
    sequence: 2,
    stagedMediaId: "photo-1",
    state: "outcome_unknown",
    updatedAt: "2026-08-19T09:59:00.000Z",
  });
  const graph = new ScriptedFacebookGraph({ stagedPostId: "post-1" });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(outcome.status, "outcome-unknown");
  // Ni siquiera consulta: espera la decisión humana que lo puso ahí.
  assert.deepEqual(graph.calls, []);
});

test("un rechazo explícito no deja el desenlace en duda", async () => {
  // Un permiso rechazado no creó ninguna publicación, así que el intento queda
  // fallido y su reintento es seguro.
  const graph = new ScriptedFacebookGraph({
    createPagePost: (): never => {
      throw new MetaPublishingError(
        "permission-denied",
        "Meta rechazó los permisos.",
        false,
      );
    },
  });
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "permission-denied");
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.state, "failed");
  assert.equal(attempt.stagedMediaId, "photo-1");
});

test("una foto preparada vencida se descarta para preparar otra", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-1",
    organizationId,
    publicationTargetId: "target-facebook-1",
    sequence: 1,
    stagedMediaId: "photo-vieja",
    state: "media_staged",
    updatedAt: "2026-08-18T09:00:00.000Z",
  });
  const graph = new ScriptedFacebookGraph({
    createPagePost: (): never => {
      throw new MetaPublishingError(
        "staged-media-expired",
        "La foto preparada ya no existe.",
        true,
      );
    },
  });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "staged-media-expired");
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.stagedMediaId, undefined);
});

test("un fallo al preparar la foto no deja el desenlace en duda", async () => {
  // Todavía no hay foto: nada pudo publicarse, así que es un fallo simple.
  const graph = new ScriptedFacebookGraph({
    stagePhoto: (): never => {
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
});

test("una publicación sin texto se rechaza antes de llamar a Meta", async () => {
  const graph = new ScriptedFacebookGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const probe = new ScriptedProbe();
  const outcome = await publisherWith(graph, journal, probe).publish(
    command({ copy: "   " }),
  );

  assert.equal(failureCodeOf(outcome), "validation-failed");
  assert.equal(probe.calls, 0);
  assert.deepEqual(graph.calls, []);
});

test("una URL inaccesible se detecta antes de subir nada", async () => {
  const graph = new ScriptedFacebookGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(
    graph,
    journal,
    new ScriptedProbe({ status: "unreachable" }),
  ).publish(command());

  assert.equal(failureCodeOf(outcome), "media-unreachable");
  assert.deepEqual(graph.calls, []);
});

test("una pieza que pesa más de lo que admite la Page se rechaza", async () => {
  const graph = new ScriptedFacebookGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(
    graph,
    journal,
    new ScriptedProbe({
      byteSize: 6 * 1024 * 1024,
      mimeType: "image/jpeg",
      status: "reachable",
    }),
  ).publish(command());

  assert.equal(failureCodeOf(outcome), "validation-failed");
  assert.deepEqual(graph.calls, []);
});

test("una conexión sin salud, permisos, Page o de otra organización no publica", async () => {
  for (const broken of [
    connection({ health: "permission_revoked" }),
    connection({ grantedPermissions: Object.freeze(["pages_show_list"]) }),
    connection({ organizationId: "org-ajena" }),
    connection({
      assets: Object.freeze([
        Object.freeze({
          id: "asset-instagram",
          kind: "instagram_business" as const,
          name: "@ferreteria_aramayo",
          providerAssetId: instagramAssetId,
          status: "active" as const,
        }),
      ]),
    }),
  ]) {
    const graph = new ScriptedFacebookGraph();
    const journal = new InMemoryMetaPublishingAttemptJournal();
    const outcome = await publisherWith(graph, journal).publish(
      command({ connection: broken }),
    );
    assert.equal(failureCodeOf(outcome), "permission-denied");
    assert.deepEqual(graph.calls, []);
  }
});

test("una Page removida no se usa como destino", async () => {
  const graph = new ScriptedFacebookGraph();
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const outcome = await publisherWith(graph, journal).publish(
    command({
      connection: connection({
        assets: Object.freeze(
          connection().assets.map((asset) =>
            asset.kind === "page"
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

test("un fallo de Facebook no toca el resultado de Instagram", async () => {
  // Los dos destinos comparten diario pero no fila: la clave es el destino.
  const journal = new InMemoryMetaPublishingAttemptJournal();
  journal.seed({
    attemptId: "attempt-instagram",
    organizationId,
    publicationTargetId: "target-instagram-1",
    remotePostId: "media-instagram-1",
    sequence: 2,
    stagedMediaId: "container-1",
    state: "published",
    updatedAt: "2026-08-19T09:58:00.000Z",
  });
  const graph = new ScriptedFacebookGraph({
    stagePhoto: (): never => {
      throw new MetaPublishingError(
        "media-invalid",
        "Facebook rechazó la pieza.",
        false,
      );
    },
  });
  const outcome = await publisherWith(graph, journal).publish(command());

  assert.equal(failureCodeOf(outcome), "media-invalid");
  const instagram = journal.records.find(
    (record) => record.publicationTargetId === "target-instagram-1",
  );
  assert.ok(instagram !== undefined);
  assert.equal(instagram.state, "published");
  assert.equal(instagram.remotePostId, "media-instagram-1");
  assert.equal(instagram.sequence, 2);
});

test("otro trabajador que escribe primero deja este intento en conflicto", async () => {
  const journal = new InMemoryMetaPublishingAttemptJournal();
  const contended: MetaPublishingAttemptJournal = {
    find: async (scope) => {
      const found = await journal.find(scope);
      journal.seed({
        attemptId: "attempt-otro",
        organizationId,
        publicationTargetId: "target-facebook-1",
        sequence: 1,
        stagedMediaId: "photo-otro",
        state: "media_staged",
        updatedAt: "2026-08-19T09:59:30.000Z",
      });
      return found;
    },
    save: (record) => journal.save(record),
  };

  const graph = new ScriptedFacebookGraph();
  const outcome = await publisherWith(graph, contended).publish(command());

  assert.equal(outcome.status, "conflict");
  // Se detiene sin publicar en cuanto pierde la carrera.
  assert.deepEqual(graph.calls, [`stagePhoto:${pageAssetId}`]);
  const [attempt] = journal.records;
  assert.ok(attempt !== undefined);
  assert.equal(attempt.attemptId, "attempt-otro");
});
