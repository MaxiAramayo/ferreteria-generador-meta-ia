import assert from "node:assert/strict";
import test from "node:test";

import {
  type ConfirmRemotePublicationInput,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type MetaPublishingAttemptJournal,
  type MetaPublishingAttemptRecord,
  type MetaPublishingAttemptScope,
  type MetaPublishingAttemptState,
  type MetaPublishingAttemptWriteResult,
  type PublicationRetryRepository,
  type PublicationRetryTargetRecord,
  type PublicationRetryWriteInput,
  type PublicationRetryWriteResult,
  type PublicationTarget,
  type RemotePublicationEvidence,
  type RequireManualActionInput,
} from "@aramayo/domain";

import {
  PublicationReconciliationService,
  type RemotePublicationLookupPort,
} from "./publication-reconciliation.service.ts";
import type { PublicationCredentialPort } from "./publication-order.transport.ts";

const organizationId = "org-aramayo";
const orderId = "orden-1";
const now = new Date("2026-08-20T12:30:00.000Z");

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

function openTarget(
  state: MetaPublishingAttemptState,
  target: PublicationTarget = "instagram_feed",
): PublicationRetryTargetRecord {
  return Object.freeze({
    attempts: 1,
    orderId,
    organizationId,
    publicationTargetId: `${orderId}:${target}`,
    sequence: 2,
    state,
    target,
  });
}

function attemptOf(
  state: MetaPublishingAttemptState,
  target: PublicationTarget = "instagram_feed",
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: "intento-1",
    organizationId,
    publicationTargetId: `${orderId}:${target}`,
    sequence: 2,
    stagedMediaId: "contenedor-1",
    state,
    updatedAt: "2026-08-20T12:00:00.000Z",
  });
}

/** Escritura de reconciliación: el ámbito más la marca de la consulta. */
type ReconciledWrite = PublicationRetryWriteInput &
  Readonly<{ reconciledAt: string }>;

class RetryRepositoryDouble implements PublicationRetryRepository {
  readonly confirmed: ConfirmRemotePublicationInput[] = [];
  readonly manual: RequireManualActionInput[] = [];
  readonly reopened: ReconciledWrite[] = [];
  readonly unidentified: ReconciledWrite[] = [];
  #open: readonly PublicationRetryTargetRecord[];

  constructor(open: readonly PublicationRetryTargetRecord[]) {
    this.#open = open;
  }

  openOutcomes(): Promise<readonly PublicationRetryTargetRecord[]> {
    return Promise.resolve(this.#open);
  }

  unplannedFailures(): Promise<readonly PublicationRetryTargetRecord[]> {
    return Promise.resolve(Object.freeze([]));
  }

  dueRetries(): Promise<readonly PublicationRetryTargetRecord[]> {
    return Promise.resolve(Object.freeze([]));
  }

  scheduleRetry(): Promise<PublicationRetryWriteResult> {
    return Promise.reject(
      new Error("La reconciliación no programa reintentos."),
    );
  }

  requireManualAction(
    input: RequireManualActionInput,
  ): Promise<PublicationRetryWriteResult> {
    this.manual.push(input);
    return Promise.resolve("saved");
  }

  confirmRemotePublication(
    input: ConfirmRemotePublicationInput,
  ): Promise<PublicationRetryWriteResult> {
    this.confirmed.push(input);
    return Promise.resolve("saved");
  }

  confirmWithoutIdentifier(
    input: ReconciledWrite,
  ): Promise<PublicationRetryWriteResult> {
    this.unidentified.push(input);
    return Promise.resolve("saved");
  }

  reopenForRepublish(
    input: ReconciledWrite,
  ): Promise<PublicationRetryWriteResult> {
    this.reopened.push(input);
    return Promise.resolve("saved");
  }
}

class JournalDouble implements MetaPublishingAttemptJournal {
  #attempts: ReadonlyMap<string, MetaPublishingAttemptRecord>;

  constructor(attempts: readonly MetaPublishingAttemptRecord[]) {
    this.#attempts = new Map(
      attempts.map((entry) => [entry.publicationTargetId, entry]),
    );
  }

  find(
    scope: MetaPublishingAttemptScope,
  ): Promise<MetaPublishingAttemptRecord | null> {
    return Promise.resolve(
      this.#attempts.get(scope.publicationTargetId) ?? null,
    );
  }

  save(): Promise<MetaPublishingAttemptWriteResult> {
    return Promise.reject(new Error("La reconciliación no escribe intentos."));
  }
}

const connections: MetaConnectionRepository = {
  list: () => Promise.resolve(Object.freeze([connection()])),
} as unknown as MetaConnectionRepository;

const credentials: PublicationCredentialPort = {
  pageAccessToken: () => Promise.resolve("token-de-page"),
};

function lookupReturning(
  ...evidence: readonly RemotePublicationEvidence[]
): RemotePublicationLookupPort {
  let index = 0;
  return {
    lookup: (): Promise<RemotePublicationEvidence> => {
      const next = evidence[Math.min(index, evidence.length - 1)];
      index += 1;
      if (next === undefined) {
        return Promise.reject(new Error("Sin evidencia configurada."));
      }
      return Promise.resolve(next);
    },
  };
}

function serviceFor(
  open: readonly PublicationRetryTargetRecord[],
  attempts: readonly MetaPublishingAttemptRecord[],
  lookup: RemotePublicationLookupPort,
): Readonly<{
  repository: RetryRepositoryDouble;
  service: PublicationReconciliationService;
}> {
  const repository = new RetryRepositoryDouble(open);
  return Object.freeze({
    repository,
    service: new PublicationReconciliationService(
      repository,
      new JournalDouble(attempts),
      connections,
      credentials,
      lookup,
      { now: () => now },
    ),
  });
}

test("un timeout después de que Meta aceptó se cierra con la evidencia remota", async () => {
  // El contenedor ya estaba publicado cuando la llamada se perdió: la
  // publicación existe y no hay que volver a pedirla.
  const { repository, service } = serviceFor(
    [openTarget("outcome_unknown")],
    [attemptOf("outcome_unknown")],
    lookupReturning({ status: "published-unidentified" }),
  );
  const summary = await service.reconcileBatch(10);

  assert.equal(summary.confirmed, 1);
  assert.equal(summary.republishable, 0);
  assert.equal(repository.unidentified.length, 1);
  assert.equal(repository.reopened.length, 0);
  assert.equal(repository.unidentified[0]?.reconciledAt, now.toISOString());
});

test("un timeout antes de que Meta aceptara devuelve el destino a la cola", async () => {
  // El contenedor murió sin publicar: recién ahora es seguro volver a publicar.
  const { repository, service } = serviceFor(
    [openTarget("outcome_unknown")],
    [attemptOf("outcome_unknown")],
    lookupReturning({ status: "absent" }),
  );
  const summary = await service.reconcileBatch(10);

  assert.equal(summary.republishable, 1);
  assert.equal(repository.reopened.length, 1);
  assert.equal(repository.confirmed.length, 0);
});

test("la evidencia con identificador cierra el destino y anota el enlace", async () => {
  const { repository, service } = serviceFor(
    [openTarget("outcome_unknown", "facebook_page")],
    [attemptOf("outcome_unknown", "facebook_page")],
    lookupReturning({
      remotePermalink: "https://www.facebook.com/1/posts/2",
      remotePostId: "252222471780140_1587397416410955",
      status: "published",
    }),
  );
  const summary = await service.reconcileBatch(10);

  assert.equal(summary.confirmed, 1);
  const [confirmed] = repository.confirmed;
  assert.ok(confirmed);
  assert.equal(confirmed.remotePostId, "252222471780140_1587397416410955");
  assert.equal(confirmed.remotePermalink, "https://www.facebook.com/1/posts/2");
  // Escribe contra la secuencia del intento, no contra la que trajo el barrido.
  assert.equal(confirmed.sequence, 2);
});

test("un desenlace que sigue sin resolverse queda para una persona", async () => {
  const { repository, service } = serviceFor(
    [openTarget("outcome_unknown")],
    [attemptOf("outcome_unknown")],
    lookupReturning({ status: "indeterminate" }),
  );
  const summary = await service.reconcileBatch(10);

  assert.equal(summary.unresolved, 1);
  assert.equal(repository.manual[0]?.reason, "outcome-unresolved");
  // No se republica ni se declara publicado: las dos salidas automáticas son
  // peores que preguntar.
  assert.equal(repository.reopened.length, 0);
  assert.equal(repository.confirmed.length, 0);
});

test("reconciliar nunca reabre un destino ya publicado", async () => {
  const { repository, service } = serviceFor(
    [openTarget("published")],
    [attemptOf("published")],
    lookupReturning({ status: "absent" }),
  );
  const summary = await service.reconcileBatch(10);

  // El barrido lo descarta antes de gastar la llamada remota.
  assert.equal(summary.confirmed, 0);
  assert.equal(summary.republishable, 0);
  assert.equal(repository.reopened.length, 0);
  assert.equal(repository.manual.length, 0);
});

test("una consulta que rompe no impide revisar los demás destinos", async () => {
  const repository = new RetryRepositoryDouble([
    openTarget("outcome_unknown", "facebook_page"),
    openTarget("outcome_unknown", "instagram_feed"),
  ]);
  let first = true;
  const service = new PublicationReconciliationService(
    repository,
    new JournalDouble([
      attemptOf("outcome_unknown", "facebook_page"),
      attemptOf("outcome_unknown", "instagram_feed"),
    ]),
    connections,
    credentials,
    {
      lookup: (): Promise<RemotePublicationEvidence> => {
        if (first) {
          first = false;
          return Promise.reject(new Error("La consulta remota falló."));
        }
        return Promise.resolve(Object.freeze({ status: "absent" as const }));
      },
    },
    { now: (): Date => now },
  );

  const summary = await service.reconcileBatch(10);
  assert.equal(summary.failed, 1);
  assert.equal(summary.republishable, 1);
  assert.equal(repository.reopened.length, 1);
});
