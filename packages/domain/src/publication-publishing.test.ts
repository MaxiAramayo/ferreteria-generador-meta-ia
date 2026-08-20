import assert from "node:assert/strict";
import test from "node:test";

import {
  pendingPublicationTargets,
  publicationOrderStatus,
  type MetaPublishingAttemptState,
  type PublicationOrderRecord,
  type PublicationOrderTargetRecord,
  type PublicationTarget,
} from "./index.ts";

function targetAt(
  target: PublicationTarget,
  state: MetaPublishingAttemptState,
): PublicationOrderTargetRecord {
  return Object.freeze({
    publicationTargetId: `orden-1:${target}`,
    state,
    target,
    updatedAt: "2026-08-19T22:00:00.000Z",
  });
}

function order(
  targets: readonly PublicationOrderTargetRecord[],
  overrides: Partial<PublicationOrderRecord> = {},
): PublicationOrderRecord {
  return Object.freeze({
    approvalSnapshotId: "snapshot-1",
    createdAt: "2026-08-19T21:00:00.000Z",
    id: "orden-1",
    organizationId: "org-aramayo",
    publicationId: "publicacion-1",
    requestedByMembershipId: "membresia-1",
    targets,
    updatedAt: "2026-08-19T22:00:00.000Z",
    ...overrides,
  });
}

test("una orden con todos los destinos publicados queda publicada", () => {
  assert.equal(
    publicationOrderStatus([
      targetAt("instagram_feed", "published"),
      targetAt("facebook_page", "published"),
    ]),
    "published",
  );
});

test("un destino sin confirmar cuenta como salido para el agregado", () => {
  // Meta dijo que salió aunque no devolvió el identificador: declararlo fallido
  // escondería una publicación que está a la vista.
  assert.equal(
    publicationOrderStatus([
      targetAt("instagram_feed", "published"),
      targetAt("facebook_page", "published_unconfirmed"),
    ]),
    "published",
  );
});

test("un solo destino fallido impide declarar la orden publicada", () => {
  assert.equal(
    publicationOrderStatus([
      targetAt("instagram_feed", "published"),
      targetAt("facebook_page", "failed"),
    ]),
    "partially_published",
  );
});

test("todos los destinos fallidos dan fallo total", () => {
  assert.equal(
    publicationOrderStatus([
      targetAt("instagram_feed", "failed"),
      targetAt("facebook_page", "failed"),
    ]),
    "publish_failed",
  );
});

test("mientras quede trabajo en curso la orden sigue publicando", () => {
  for (const state of ["pending", "media_staged"] as const) {
    assert.equal(
      publicationOrderStatus([
        targetAt("instagram_feed", "published"),
        targetAt("facebook_page", state),
      ]),
      "publishing",
      state,
    );
  }
});

test("un desenlace desconocido impide resolver la orden", () => {
  // Ni publicada —nadie comprobó que saliera— ni fallida —puede haber salido—.
  // Queda en curso y el detalle por destino muestra cuál está en duda.
  assert.equal(
    publicationOrderStatus([
      targetAt("instagram_feed", "published"),
      targetAt("facebook_page", "outcome_unknown"),
    ]),
    "publishing",
  );
  assert.equal(
    publicationOrderStatus([
      targetAt("instagram_feed", "failed"),
      targetAt("facebook_page", "outcome_unknown"),
    ]),
    "publishing",
  );
});

test("una orden sin destinos se trata como fallida y no como publicada", () => {
  // «Todos salieron» sobre un conjunto vacío es cierto por vacuidad y sería la
  // peor respuesta posible.
  assert.equal(publicationOrderStatus([]), "publish_failed");
});

test("un destino exitoso no vuelve a intentarse", () => {
  const pending = pendingPublicationTargets(
    order([
      targetAt("instagram_feed", "published"),
      targetAt("facebook_page", "failed"),
    ]),
  );
  assert.deepEqual(
    pending.map((entry) => entry.target),
    ["facebook_page"],
  );
});

test("un destino en duda tampoco se reintenta", () => {
  const pending = pendingPublicationTargets(
    order([
      targetAt("instagram_feed", "outcome_unknown"),
      targetAt("facebook_page", "published_unconfirmed"),
    ]),
  );
  assert.deepEqual(pending, []);
});

test("cancelar impide intentos nuevos sin borrar los éxitos previos", () => {
  const cancelled = order(
    [
      targetAt("instagram_feed", "published"),
      targetAt("facebook_page", "pending"),
    ],
    { cancelledAt: "2026-08-19T22:05:00.000Z" },
  );
  assert.deepEqual(pendingPublicationTargets(cancelled), []);
  // El éxito anterior sigue en la orden y en el agregado.
  assert.equal(cancelled.targets[0]?.state, "published");
  assert.equal(publicationOrderStatus(cancelled.targets), "publishing");
});

test("un destino pendiente se intenta", () => {
  const pending = pendingPublicationTargets(
    order([
      targetAt("instagram_feed", "pending"),
      targetAt("facebook_page", "media_staged"),
    ]),
  );
  assert.deepEqual(
    pending.map((entry) => entry.target),
    ["instagram_feed", "facebook_page"],
  );
});
