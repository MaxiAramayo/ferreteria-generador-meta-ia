import assert from "node:assert/strict";
import test from "node:test";

import {
  type FacebookPublishingPort,
  type InstagramContainerState,
  type InstagramPublishingPort,
  type MetaConnectionRecord,
  type MetaPublishingAttemptRecord,
  type PublicationRetryTargetRecord,
  type PublicationTarget,
} from "@aramayo/domain";

import { MetaPublicationLookupAdapter } from "./meta-publication-lookup.adapter.ts";

const organizationId = "org-aramayo";
const orderId = "orden-1";

function attemptOf(
  overrides: Partial<MetaPublishingAttemptRecord> = {},
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: "intento-1",
    organizationId,
    publicationTargetId: `${orderId}:instagram_feed`,
    sequence: 2,
    stagedMediaId: "contenedor-1",
    state: "outcome_unknown" as const,
    updatedAt: "2026-08-20T12:00:00.000Z",
    ...overrides,
  });
}

function targetOf(target: PublicationTarget): PublicationRetryTargetRecord {
  return Object.freeze({
    attempts: 1,
    orderId,
    organizationId,
    publicationTargetId: `${orderId}:${target}`,
    sequence: 2,
    state: "outcome_unknown" as const,
    target,
  });
}

function instagramReturning(
  state: InstagramContainerState,
): InstagramPublishingPort {
  return {
    readContainer: () => Promise.resolve(Object.freeze({ state })),
  } as unknown as InstagramPublishingPort;
}

function facebookReturning(
  postId: string | undefined,
  permalink: string | null = null,
): FacebookPublishingPort {
  return {
    readPermalink: () => Promise.resolve(permalink),
    readStagedPhoto: () =>
      Promise.resolve(Object.freeze(postId === undefined ? {} : { postId })),
  } as unknown as FacebookPublishingPort;
}

const connection = {} as unknown as MetaConnectionRecord;

function lookupWith(
  instagram: InstagramPublishingPort,
  facebook: FacebookPublishingPort,
  target: PublicationTarget,
  attempt: MetaPublishingAttemptRecord = attemptOf(),
): Promise<unknown> {
  return new MetaPublicationLookupAdapter(instagram, facebook).lookup({
    accessToken: "token-de-page",
    attempt,
    connection,
    target: targetOf(target),
  });
}

test("un contenedor publicado prueba que salió pero no da la media", async () => {
  assert.deepEqual(
    await lookupWith(
      instagramReturning("published"),
      facebookReturning(undefined),
      "instagram_feed",
    ),
    { status: "published-unidentified" },
  );
});

test("un contenedor muerto prueba que la publicación no existe", async () => {
  for (const state of ["error", "expired"] as const) {
    assert.deepEqual(
      await lookupWith(
        instagramReturning(state),
        facebookReturning(undefined),
        "instagram_feed",
      ),
      { status: "absent" },
      `el contenedor ${state} no se tradujo a ausencia`,
    );
  }
  // Listo para publicar tampoco es publicado.
  assert.deepEqual(
    await lookupWith(
      instagramReturning("finished"),
      facebookReturning(undefined),
      "instagram_feed",
    ),
    { status: "absent" },
  );
});

test("un contenedor en curso todavía no prueba nada", async () => {
  assert.deepEqual(
    await lookupWith(
      instagramReturning("in_progress"),
      facebookReturning(undefined),
      "instagram_feed",
    ),
    { status: "indeterminate" },
  );
});

test("la Page prueba la publicación cuando devuelve identificador", async () => {
  assert.deepEqual(
    await lookupWith(
      instagramReturning("in_progress"),
      facebookReturning("252222471780140_1587397416410955", "https://fb/1"),
      "facebook_page",
    ),
    {
      remotePermalink: "https://fb/1",
      remotePostId: "252222471780140_1587397416410955",
      status: "published",
    },
  );
});

test("la Page nunca prueba una ausencia", async () => {
  // Meta documenta que `page_story_id` puede faltar, así que su ausencia es
  // desconocimiento y no negativa. Traducirla a `absent` republicaría.
  assert.deepEqual(
    await lookupWith(
      instagramReturning("in_progress"),
      facebookReturning(undefined),
      "facebook_page",
    ),
    { status: "indeterminate" },
  );
});

test("un identificador ya guardado zanja la pregunta sin llamar a Meta", async () => {
  const exploding = {
    readContainer: () => Promise.reject(new Error("No se debe consultar.")),
  } as unknown as InstagramPublishingPort;
  assert.deepEqual(
    await lookupWith(
      exploding,
      facebookReturning(undefined),
      "instagram_feed",
      attemptOf({ remotePermalink: "https://ig/1", remotePostId: "17999" }),
    ),
    {
      remotePermalink: "https://ig/1",
      remotePostId: "17999",
      status: "published",
    },
  );
});

test("sin anclaje remoto la respuesta es desconocimiento, no ausencia", async () => {
  // Inventar una negativa acá republicaría algo que quizá salió.
  const attempt = Object.freeze({
    attemptId: "intento-1",
    organizationId,
    publicationTargetId: `${orderId}:instagram_feed`,
    sequence: 2,
    state: "outcome_unknown" as const,
    updatedAt: "2026-08-20T12:00:00.000Z",
  });
  assert.deepEqual(
    await lookupWith(
      instagramReturning("published"),
      facebookReturning(undefined),
      "instagram_feed",
      attempt,
    ),
    { status: "indeterminate" },
  );
});
