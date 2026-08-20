import assert from "node:assert/strict";
import test from "node:test";

import {
  metaPublishingFailureCodes,
  needsPublicationReconciliation,
  planPublicationRetry,
  publicationRetryDelayMilliseconds,
  publicationRetryDisposition,
  publicationRetryLimits,
  reconcilePublicationTarget,
  type MetaPublishingAttemptRecord,
  type MetaPublishingAttemptState,
  type MetaPublishingFailureCode,
  type RemotePublicationEvidence,
} from "./index.ts";

const now = "2026-08-20T12:00:00.000Z";

function attemptAt(
  state: MetaPublishingAttemptState,
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: "intento-1",
    organizationId: "org-aramayo",
    publicationTargetId: "orden-1:instagram_feed",
    sequence: 1,
    state,
    updatedAt: now,
  });
}

function plan(
  code: MetaPublishingFailureCode,
  attempts: number,
  jitter = 0,
): ReturnType<typeof planPublicationRetry> {
  return planPublicationRetry({ attempts, code, jitter, now });
}

test("cada código de fallo tiene una salida declarada", () => {
  // La tabla se recorre entera: un código nuevo sin clasificar no puede caer en
  // un reintento automático por omisión.
  for (const code of metaPublishingFailureCodes) {
    assert.ok(
      ["manual", "reconcile", "scheduled"].includes(
        publicationRetryDisposition(code),
      ),
      `${code} no tiene salida declarada`,
    );
  }
});

test("un error permanente no se reintenta solo", () => {
  // Los mismos bytes, el mismo permiso y el mismo token fallan igual más tarde.
  for (const code of [
    "media-invalid",
    "permission-denied",
    "processing-failed",
    "token-expired",
    "validation-failed",
  ] as const) {
    assert.deepEqual(plan(code, 0), {
      reason: "permanent-failure",
      status: "manual",
    });
  }
});

test("un desenlace ambiguo se reconcilia en vez de reintentarse", () => {
  // Los dos casos en que la publicación puede existir sin que la plataforma lo
  // sepa. Reintentar cualquiera de ellos a ciegas produce la segunda
  // publicación.
  assert.deepEqual(plan("request-timeout", 0), { status: "reconcile" });
  assert.deepEqual(plan("processing-timeout", 0), { status: "reconcile" });
});

test("la ambigüedad se resuelve antes que el conteo de intentos", () => {
  // Un desenlace desconocido no se puede dar por agotado: nadie sabe todavía si
  // hacía falta reintentarlo.
  assert.deepEqual(
    plan("request-timeout", publicationRetryLimits.attemptsMaximum + 3),
    { status: "reconcile" },
  );
});

test("una causa temporal se reintenta con fecha", () => {
  const scheduled = plan("provider-error", 0);
  assert.equal(scheduled.status, "scheduled");
  assert.ok(Date.parse(scheduled.nextAttemptAt) > Date.parse(now));
});

test("la espera crece con los intentos y se corta en el tope", () => {
  const delays = [0, 1, 2, 3].map((attempts) =>
    publicationRetryDelayMilliseconds("provider-error", attempts, 0),
  );
  // Estrictamente creciente mientras la ventana no toque el tope.
  for (let index = 1; index < delays.length; index += 1) {
    assert.ok(
      (delays[index] ?? 0) > (delays[index - 1] ?? 0),
      `la espera no creció en el intento ${String(index)}`,
    );
  }
  // Ninguna espera automática supera el tope declarado.
  assert.equal(
    publicationRetryDelayMilliseconds("provider-error", 40, 1),
    publicationRetryLimits.delayCapMilliseconds,
  );
});

test("el jitter reparte la mitad superior de la ventana", () => {
  const floorDelay = publicationRetryDelayMilliseconds("provider-error", 2, 0);
  const ceilingDelay = publicationRetryDelayMilliseconds(
    "provider-error",
    2,
    1,
  );
  // Con jitter distinto la espera es distinta: dos destinos que fallaron juntos
  // no pueden volver en el mismo instante.
  assert.ok(ceilingDelay > floorDelay);
  // Y ninguno vuelve tan pronto como para que la espera no signifique nada.
  assert.equal(floorDelay * 2, ceilingDelay);
});

test("un jitter fuera de rango no acorta ni estira la espera", () => {
  assert.equal(
    publicationRetryDelayMilliseconds("provider-error", 2, -5),
    publicationRetryDelayMilliseconds("provider-error", 2, 0),
  );
  assert.equal(
    publicationRetryDelayMilliseconds("provider-error", 2, 5),
    publicationRetryDelayMilliseconds("provider-error", 2, 1),
  );
});

test("el límite de Meta impone un piso que el backoff no puede bajar", () => {
  // Volver dentro de la ventana que rechazó suma otra llamada al mismo contador
  // que causó el rechazo.
  assert.ok(
    publicationRetryDelayMilliseconds("rate-limit", 0, 0) >=
      publicationRetryLimits.rateLimitFloorMilliseconds,
  );
  assert.ok(
    publicationRetryDelayMilliseconds("publishing-limit-reached", 0, 0) >=
      publicationRetryLimits.publishingLimitFloorMilliseconds,
  );
  // Un código sin límite propio no arrastra el piso de los que sí lo tienen.
  assert.ok(
    publicationRetryDelayMilliseconds("provider-error", 0, 0) <
      publicationRetryLimits.rateLimitFloorMilliseconds,
  );
});

test("agotar los intentos pide decisión humana y no se confunde con permanente", () => {
  const exhausted = plan(
    "provider-error",
    publicationRetryLimits.attemptsMaximum,
  );
  assert.deepEqual(exhausted, {
    reason: "attempts-exhausted",
    status: "manual",
  });
  // El intento anterior al límite todavía se programa.
  assert.equal(
    plan("provider-error", publicationRetryLimits.attemptsMaximum - 1).status,
    "scheduled",
  );
});

test("la evidencia remota gana sobre el estado local", () => {
  // El caso divergente: acá figura fallido y Meta lo tiene publicado. Se anota
  // el identificador; no se vuelve a publicar.
  const confirmed = reconcilePublicationTarget(attemptAt("failed"), {
    remotePermalink: "https://www.instagram.com/p/abc/",
    remotePostId: "17999",
    status: "published",
  });
  assert.deepEqual(confirmed, {
    remotePermalink: "https://www.instagram.com/p/abc/",
    remotePostId: "17999",
    status: "confirmed",
  });
});

test("reconciliar no toca un destino ya publicado", () => {
  // Nunca se sobreescribe un éxito confirmado, aunque el proveedor conteste
  // otra cosa.
  for (const evidence of [
    { remotePostId: "otro", status: "published" },
    { status: "absent" },
    { status: "indeterminate" },
  ] as readonly RemotePublicationEvidence[]) {
    assert.deepEqual(
      reconcilePublicationTarget(attemptAt("published"), evidence),
      {
        status: "already-settled",
      },
    );
  }
});

test("recién con ausencia confirmada el destino vuelve a ser publicable", () => {
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("outcome_unknown"), {
      status: "absent",
    }),
    { status: "republishable" },
  );
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("media_staged"), { status: "absent" }),
    { status: "republishable" },
  );
});

test("una respuesta indeterminada deja el destino sin resolver", () => {
  // El proveedor no puede afirmar ni negar. Decidir por él es lo que duplica.
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("outcome_unknown"), {
      status: "indeterminate",
    }),
    { status: "unresolved" },
  );
});

test("un destino confirmado sin identificador jamás vuelve a publicarse", () => {
  // El proveedor ya dijo que publicó. Que después no aparezca puede ser un
  // índice atrasado, y republicar sobre esa duda produce la segunda
  // publicación.
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("published_unconfirmed"), {
      status: "absent",
    }),
    { status: "unresolved" },
  );
  // Pero sí recupera el identificador cuando aparece: eso es actualizar
  // evidencia, no reescribir el resultado.
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("published_unconfirmed"), {
      remotePostId: "17999",
      status: "published",
    }),
    { remotePostId: "17999", status: "confirmed" },
  );
});

test("sólo los estados con desenlace abierto piden reconciliación", () => {
  assert.equal(needsPublicationReconciliation("media_staged"), true);
  assert.equal(needsPublicationReconciliation("outcome_unknown"), true);
  assert.equal(needsPublicationReconciliation("published_unconfirmed"), true);
  assert.equal(needsPublicationReconciliation("published"), false);
  assert.equal(needsPublicationReconciliation("failed"), false);
  assert.equal(needsPublicationReconciliation("pending"), false);
});

test("una publicación sin identificador se cierra sin poder mostrarse", () => {
  // Es lo único que prueba el estado de un contenedor de Instagram: salió, y no
  // devuelve la media. Ni republicable ni en duda.
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("outcome_unknown"), {
      status: "published-unidentified",
    }),
    { status: "confirmed-unidentified" },
  );
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("media_staged"), {
      status: "published-unidentified",
    }),
    { status: "confirmed-unidentified" },
  );
});

test("volver a confirmar sin identificador lo que ya estaba así no escribe", () => {
  // La consulta no aportó nada; escribir sólo haría avanzar la secuencia por
  // nada y competir con el publicador sin motivo.
  assert.deepEqual(
    reconcilePublicationTarget(attemptAt("published_unconfirmed"), {
      status: "published-unidentified",
    }),
    { status: "already-settled" },
  );
});
