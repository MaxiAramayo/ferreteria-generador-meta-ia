import assert from "node:assert/strict";
import test from "node:test";

import type {
  PublicationManualActionResponse,
  PublicationOrderTargetResponse,
  PublicationSummaryResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";
import type { AuthenticatedActor, OrganizationRole } from "@aramayo/domain";

import {
  beginPublishSubmission,
  publicationTargetOutcome,
  publishConfirmationTargetChoice,
  publishGate,
  settlePublishSubmission,
  visibleManualActions,
} from "./publication-publishing-presentation.ts";

test("los destinos exactos reemplazan y bloquean la selección general", () => {
  assert.deepEqual(
    publishConfirmationTargetChoice(
      ["instagram_feed", "instagram_story", "facebook_page"],
      ["instagram_feed", "facebook_page"],
    ),
    {
      kind: "locked",
      targets: ["instagram_feed", "facebook_page"],
    },
  );
  assert.deepEqual(
    publishConfirmationTargetChoice(
      ["instagram_feed", "facebook_page"],
      ["instagram_feed", "instagram_story", "facebook_page"],
    ),
    { kind: "unavailable", targets: [] },
  );
});

const organizationId = "10000000-0000-4000-8000-000000000001";

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

function publication(
  status: PublicationSummaryResponse["status"] = "approved",
): PublicationSummaryResponse {
  return Object.freeze({
    createdAt: "2026-08-20T10:00:00.000Z",
    id: "20000000-0000-4000-8000-000000000002",
    latestContentHash: "a".repeat(64),
    latestRevisionId: "30000000-0000-4000-8000-000000000003",
    latestRevisionNumber: 1,
    status,
    title: "Promoción de amoladoras",
    updatedAt: "2026-08-20T11:00:00.000Z",
    version: 3,
  });
}

function readiness(
  overrides: Partial<PublishingReadinessResponse> = {},
): PublishingReadinessResponse {
  return Object.freeze({
    accountName: "Ferretería y Lubricentro Aramayo",
    canPublish: true,
    targets: Object.freeze([
      "instagram_feed" as const,
      "instagram_story" as const,
      "facebook_page" as const,
    ]),
    ...overrides,
  });
}

test("una pieza aprobada con conexión sana ofrece publicar y nombra la cuenta", () => {
  const gate = publishGate(actor(), publication(), readiness());

  assert.equal(gate.kind, "ready");
  // La cuenta se muestra antes de confirmar: publicar en la cuenta equivocada
  // es tan irreversible como publicar la pieza equivocada.
  assert.equal(gate.accountName, "Ferretería y Lubricentro Aramayo");
  assert.deepEqual(
    [...gate.targets],
    ["instagram_feed", "instagram_story", "facebook_page"],
  );
});

test("sin el rol de publicar no se ofrece nada ni se revela el resto", () => {
  for (const roles of [["editor"], ["approver"], ["viewer"]] as const) {
    const gate = publishGate(actor(roles), publication("draft"), null);
    // La pieza está en borrador y no hay conexión, y aun así el motivo es el
    // rol: quien no puede publicar no necesita el estado del resto.
    assert.deepEqual(gate, {
      kind: "blocked",
      message: "Tu rol no permite publicar.",
      reason: "missing-role",
    });
  }
});

test("una pieza sin aprobar no se puede publicar", () => {
  for (const status of [
    "draft",
    "ready_for_review",
    "generating_assets",
  ] as const) {
    const gate = publishGate(actor(), publication(status), readiness());
    assert.equal(gate.kind, "blocked");
    assert.equal(gate.reason, "not-approved");
  }
});

test("una pieza programada sí se puede publicar", () => {
  assert.equal(
    publishGate(actor(), publication("scheduled"), readiness()).kind,
    "ready",
  );
});

test("una publicación en curso o ya publicada no se vuelve a pedir", () => {
  const enCurso = publishGate(actor(), publication("publishing"), readiness());
  assert.equal(enCurso.kind, "blocked");
  assert.equal(enCurso.reason, "already-publishing");

  const publicada = publishGate(actor(), publication("published"), readiness());
  assert.equal(publicada.kind, "blocked");
  assert.equal(publicada.reason, "already-published");
});

test("sin conexión habilitada la UI no ofrece publicar", () => {
  // Sin haber leído todavía, el control no se ofrece: hacerlo antes de saber si
  // hay conexión sería ofrecerlo a ciegas.
  const sinLeer = publishGate(actor(), publication(), null);
  assert.equal(sinLeer.kind, "blocked");
  assert.equal(sinLeer.reason, "no-healthy-connection");

  const enferma = publishGate(
    actor(),
    publication(),
    readiness({ canPublish: false, targets: Object.freeze([]) }),
  );
  assert.equal(enferma.kind, "blocked");
  assert.equal(enferma.reason, "no-healthy-connection");
});

test("una conexión sin destinos publicables se explica aparte", () => {
  // No es lo mismo que no haya conexión que que la conexión no sirva: la
  // persona tiene que saber cuál de las dos cosas arreglar.
  const gate = publishGate(
    actor(),
    publication(),
    readiness({ targets: Object.freeze([]) }),
  );
  assert.equal(gate.kind, "blocked");
  assert.equal(gate.reason, "no-target-available");
});

test("los destinos ofrecidos son los que la API declaró", () => {
  // El panel no los deduce de los activos: la regla vive del lado que conoce la
  // conexión, y duplicarla acá la haría divergir.
  const gate = publishGate(
    actor(),
    publication(),
    readiness({ targets: Object.freeze(["facebook_page" as const]) }),
  );
  assert.equal(gate.kind, "ready");
  assert.deepEqual([...gate.targets], ["facebook_page"]);
});

function orderTarget(
  state: PublicationOrderTargetResponse["state"],
): PublicationOrderTargetResponse {
  return Object.freeze({
    state,
    target: "instagram_feed" as const,
    updatedAt: "2026-08-20T12:00:00.000Z",
  });
}

test("el resultado por destino separa éxito, error y duda", () => {
  assert.equal(publicationTargetOutcome(orderTarget("published")), "published");
  // Sin identificador sigue siendo un éxito: salió.
  assert.equal(
    publicationTargetOutcome(orderTarget("published_unconfirmed")),
    "published",
  );
  assert.equal(publicationTargetOutcome(orderTarget("failed")), "failed");
  // La duda no se pinta como error: un fallo se reintenta y una duda no, y
  // confundirlos haría que alguien pida el reintento que duplica.
  assert.equal(
    publicationTargetOutcome(orderTarget("outcome_unknown")),
    "unknown",
  );
  for (const state of ["pending", "media_staged"] as const) {
    assert.equal(publicationTargetOutcome(orderTarget(state)), "in-flight");
  }
});

function stopped(): PublicationManualActionResponse {
  return Object.freeze({
    actions: Object.freeze(["reconcile", "abandon"] as const),
    attempts: 5,
    orderId: "60000000-0000-4000-8000-000000000006",
    publicationId: "20000000-0000-4000-8000-000000000002",
    publicationTargetId: "60000000-0000-4000-8000-000000000006:facebook_page",
    reason: "outcome-unresolved" as const,
    state: "outcome_unknown" as const,
    target: "facebook_page" as const,
    updatedAt: "2026-08-20T12:00:00.000Z",
  });
}

test("las acciones manuales llegan del servidor y el panel sólo suma el rol", () => {
  // No se recalculan acá: tener la regla en dos lugares garantiza que en algún
  // momento difieran, y la diferencia sería ofrecer un reintento que duplica.
  assert.deepEqual(
    [...visibleManualActions(actor(), stopped())],
    ["reconcile", "abandon"],
  );
  assert.deepEqual([...visibleManualActions(actor(["editor"]), stopped())], []);
});

test("un segundo clic mientras el envío está en curso no produce otra llamada", () => {
  let minted = 0;
  const mint = (): string => `clave-${String((minted += 1))}`;

  const first = beginPublishSubmission({ kind: "idle" }, mint);
  assert.ok(first);
  assert.equal(first.kind, "sending");
  // El segundo evento se descarta: `null` es la barrera contra el doble clic.
  assert.equal(beginPublishSubmission(first, mint), null);
  assert.equal(minted, 1);
});

test("reintentar después de un rechazo conserva la clave del intento", () => {
  let minted = 0;
  const mint = (): string => `clave-${String((minted += 1))}`;

  const started = beginPublishSubmission({ kind: "idle" }, mint);
  assert.ok(started);
  const rejected = settlePublishSubmission(started, {
    kind: "rejected",
    message: "La API rechazó la publicación.",
  });
  const retried = beginPublishSubmission(rejected, mint);
  assert.ok(retried);

  // Es lo que hace que la protección funcione de verdad: si el primer pedido
  // llegó y lo que se perdió fue la respuesta, el segundo trae la misma clave y
  // la API devuelve la orden original en lugar de crear otra.
  assert.equal(retried.kind, "sending");
  assert.equal(retried.idempotencyKey, "clave-1");
  assert.equal(minted, 1);
});

test("un desenlace indeterminado conserva la clave para poder reintentar", () => {
  const started = beginPublishSubmission({ kind: "idle" }, () => "clave-1");
  assert.ok(started);
  const unknown = settlePublishSubmission(started, {
    kind: "indeterminate",
    message: "No sabemos si el pedido llegó.",
  });
  assert.equal(unknown.kind, "indeterminate");
  assert.equal(unknown.idempotencyKey, "clave-1");
});

test("una publicación aceptada cierra el envío y suelta la clave", () => {
  const started = beginPublishSubmission({ kind: "idle" }, () => "clave-1");
  assert.ok(started);
  const done = settlePublishSubmission(started, { kind: "accepted" });
  assert.deepEqual(done, { kind: "idle" });

  // El intento siguiente es otro pedido y merece su propia clave: reutilizar la
  // de una orden ya creada devolvería esa orden en vez de crear la nueva.
  const next = beginPublishSubmission(done, () => "clave-2");
  assert.ok(next);
  assert.equal(next.kind, "sending");
  assert.equal(next.idempotencyKey, "clave-2");
});

test("la puerta cubre la matriz de roles por estado sin dejar huecos", () => {
  const states = [
    "approved",
    "draft",
    "generation_failed",
    "partially_published",
    "publish_failed",
    "published",
    "publishing",
    "ready_for_review",
    "scheduled",
  ] as const;
  const roles = [
    ["publisher"],
    ["admin"],
    ["approver"],
    ["editor"],
    ["viewer"],
  ] as const;

  for (const currentRoles of roles) {
    const publishes =
      publishGate(actor(currentRoles), publication("approved"), readiness())
        .kind === "ready";
    for (const status of states) {
      const gate = publishGate(
        actor(currentRoles),
        publication(status),
        readiness(),
      );
      if (!publishes) {
        // Sin el permiso, ningún estado abre la puerta y el motivo es siempre
        // el rol: el resto del estado no se filtra.
        assert.deepEqual(
          gate,
          {
            kind: "blocked",
            message: "Tu rol no permite publicar.",
            reason: "missing-role",
          },
          `${currentRoles.join()} sobre ${status}`,
        );
        continue;
      }
      // Con el permiso, sólo dos estados publican. Cualquier otro queda
      // bloqueado con un motivo explícito, nunca en silencio.
      const shouldPublish = status === "approved" || status === "scheduled";
      assert.equal(
        gate.kind === "ready",
        shouldPublish,
        `${currentRoles.join()} sobre ${status}`,
      );
      if (!shouldPublish) {
        assert.ok(
          gate.kind === "blocked" && gate.message.length > 0,
          `${status} quedó bloqueado sin explicar por qué`,
        );
      }
    }
  }
});
