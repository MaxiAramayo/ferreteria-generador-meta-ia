import assert from "node:assert/strict";
import test from "node:test";

import type {
  MetaConnectionResponse,
  PublicationManualActionResponse,
  PublicationOrderTargetResponse,
  PublicationSummaryResponse,
} from "@aramayo/contracts";
import type { AuthenticatedActor, OrganizationRole } from "@aramayo/domain";

import {
  availablePublishTargets,
  publicationTargetOutcome,
  publishGate,
  visibleManualActions,
} from "./publication-publishing-presentation.ts";

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

function connection(
  overrides: Partial<MetaConnectionResponse> = {},
): MetaConnectionResponse {
  return Object.freeze({
    accountName: "Ferretería y Lubricentro Aramayo",
    assets: Object.freeze([
      Object.freeze({
        id: "asset-page",
        kind: "page" as const,
        name: "Aramayo",
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
    canPublish: true,
    createdAt: "2026-08-18T12:00:00.000Z",
    grantedPermissions: Object.freeze(["instagram_basic"]),
    health: "healthy" as const,
    id: "conexion-1",
    lastCheckedAt: "2026-08-20T09:00:00.000Z",
    missingPermissions: Object.freeze([]),
    provider: "meta" as const,
    updatedAt: "2026-08-20T09:00:00.000Z",
    version: 5,
    ...overrides,
  });
}

test("una pieza aprobada con conexión sana ofrece publicar y nombra la cuenta", () => {
  const gate = publishGate(actor(), publication(), [connection()]);

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
    const gate = publishGate(actor(roles), publication("draft"), []);
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
    const gate = publishGate(actor(), publication(status), [connection()]);
    assert.equal(gate.kind, "blocked");
    assert.equal(gate.reason, "not-approved");
  }
});

test("una pieza programada sí se puede publicar", () => {
  assert.equal(
    publishGate(actor(), publication("scheduled"), [connection()]).kind,
    "ready",
  );
});

test("una publicación en curso o ya publicada no se vuelve a pedir", () => {
  const enCurso = publishGate(actor(), publication("publishing"), [
    connection(),
  ]);
  assert.equal(enCurso.kind, "blocked");
  assert.equal(enCurso.reason, "already-publishing");

  const publicada = publishGate(actor(), publication("published"), [
    connection(),
  ]);
  assert.equal(publicada.kind, "blocked");
  assert.equal(publicada.reason, "already-published");
});

test("sin conexión habilitada la UI no ofrece publicar", () => {
  const sinConexiones = publishGate(actor(), publication(), []);
  assert.equal(sinConexiones.kind, "blocked");
  assert.equal(sinConexiones.reason, "no-healthy-connection");

  // Una conexión que existe pero no puede publicar es lo mismo que ninguna.
  const enferma = publishGate(actor(), publication(), [
    connection({ canPublish: false, health: "permission_revoked" }),
  ]);
  assert.equal(enferma.kind, "blocked");
  assert.equal(enferma.reason, "no-healthy-connection");
});

test("los destinos salen de los activos y no de una lista fija", () => {
  // Prometer Instagram con una conexión que sólo tiene Page hace que el
  // problema aparezca después de confirmar algo irreversible.
  const soloPage = connection({
    assets: Object.freeze([
      Object.freeze({
        id: "asset-page",
        kind: "page" as const,
        name: "Aramayo",
        providerAssetId: "page-1",
        status: "active" as const,
      }),
    ]),
  });
  assert.deepEqual([...availablePublishTargets(soloPage)], ["facebook_page"]);

  // Un activo inactivo no cuenta.
  const inactivo = connection({
    assets: Object.freeze([
      Object.freeze({
        id: "asset-page",
        kind: "page" as const,
        name: "Aramayo",
        providerAssetId: "page-1",
        status: "removed" as const,
      }),
    ]),
  });
  assert.deepEqual([...availablePublishTargets(inactivo)], []);
  const gate = publishGate(actor(), publication(), [inactivo]);
  assert.equal(gate.kind, "blocked");
  assert.equal(gate.reason, "no-target-available");
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
