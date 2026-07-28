import assert from "node:assert/strict";
import { test } from "node:test";

import { PUBLICATION_STATUSES, type PublicationStatus } from "./publication.ts";
import {
  isPublicationTransitionAllowed,
  transitionPublication,
  type PublicationTransitionCommand,
  type PublicationWorkflowState,
} from "./publication-workflow.ts";

const expectedTargets: Readonly<
  Record<PublicationStatus, readonly PublicationStatus[]>
> = {
  approved: ["draft", "scheduled", "publishing", "cancelled", "expired"],
  cancelled: [],
  draft: [
    "retrieving_context",
    "generating_assets",
    "ready_for_review",
    "cancelled",
  ],
  expired: [],
  generating_assets: ["ready_for_review", "generation_failed", "cancelled"],
  generation_failed: ["draft", "generating_assets", "cancelled", "expired"],
  missing_information: ["draft", "retrieving_context", "cancelled", "expired"],
  partially_published: ["publishing", "published", "publish_failed"],
  published: [],
  publishing: ["partially_published", "published", "publish_failed"],
  publish_failed: ["publishing", "cancelled", "expired"],
  ready_for_review: [
    "draft",
    "approved",
    "validation_failed",
    "cancelled",
    "expired",
  ],
  retrieving_context: [
    "missing_information",
    "generating_assets",
    "generation_failed",
    "cancelled",
  ],
  scheduled: ["approved", "publishing", "cancelled", "expired"],
  validation_failed: ["draft", "ready_for_review", "cancelled", "expired"],
};

function state(
  status: PublicationStatus,
  version = 3,
): PublicationWorkflowState {
  return Object.freeze({
    id: "publication-1",
    organizationId: "organization-1",
    status,
    version,
  });
}

function command(
  targetStatus: PublicationStatus,
  expectedVersion = 3,
): PublicationTransitionCommand {
  return {
    actorMembershipId: "membership-1",
    expectedVersion,
    occurredAt: "2026-07-28T12:00:00.000Z",
    targetStatus,
    type: "advance",
  };
}

test("la matriz cubre cada transición permitida y prohibida", () => {
  for (const fromStatus of PUBLICATION_STATUSES) {
    for (const toStatus of PUBLICATION_STATUSES) {
      assert.equal(
        isPublicationTransitionAllowed(fromStatus, toStatus),
        expectedTargets[fromStatus].includes(toStatus),
        `${fromStatus} -> ${toStatus}`,
      );
    }
  }
});

test("una transición inválida y una versión vencida no mutan el estado", () => {
  const current = state("draft");
  const before = structuredClone(current);

  const invalidTransition = transitionPublication(
    current,
    command("published"),
  );
  const staleTransition = transitionPublication(
    current,
    command("ready_for_review", 2),
  );

  assert.deepEqual(current, before);
  assert.deepEqual(invalidTransition, {
    error: {
      code: "invalid-transition",
      message: "draft cannot transition to published.",
    },
    ok: false,
  });
  assert.equal(
    staleTransition.ok ? undefined : staleTransition.error.code,
    "version-conflict",
  );
});

test("aprobar exige snapshot y revisor y conserva ambos en estado e historia", () => {
  const result = transitionPublication(state("ready_for_review"), {
    actorMembershipId: "approver-1",
    expectedVersion: 3,
    occurredAt: "2026-07-28T12:00:00.000Z",
    reviewerMembershipId: "approver-1",
    snapshotId: "snapshot-1",
    type: "approve",
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.status, "approved");
  assert.equal(result.state.version, 4);
  assert.deepEqual(result.state.approval, {
    approvedAt: "2026-07-28T12:00:00.000Z",
    reviewerMembershipId: "approver-1",
    snapshotId: "snapshot-1",
  });
  assert.deepEqual(result.event.approval, result.state.approval);

  const missingSnapshot = transitionPublication(state("ready_for_review"), {
    actorMembershipId: "approver-1",
    expectedVersion: 3,
    occurredAt: "2026-07-28T12:00:00.000Z",
    reviewerMembershipId: "approver-1",
    snapshotId: "",
    type: "approve",
  });
  assert.equal(
    missingSnapshot.ok ? undefined : missingSnapshot.error.code,
    "invalid-command",
  );
});

test("editar contenido aprobado requiere una revisión nueva e invalida la aprobación", () => {
  const approvedState: PublicationWorkflowState = {
    approval: {
      approvedAt: "2026-07-28T11:00:00.000Z",
      reviewerMembershipId: "approver-1",
      snapshotId: "snapshot-1",
    },
    ...state("approved"),
  };
  const result = transitionPublication(approvedState, {
    actorMembershipId: "editor-1",
    expectedVersion: 3,
    newRevisionId: "revision-2",
    occurredAt: "2026-07-28T12:00:00.000Z",
    type: "edit_approved",
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.status, "draft");
  assert.equal(result.state.approval, undefined);
  assert.equal(result.event.newRevisionId, "revision-2");
});

test("un fallo conserva código, mensaje seguro y reintento", () => {
  const result = transitionPublication(state("generating_assets"), {
    actorMembershipId: "worker-1",
    expectedVersion: 3,
    failure: {
      code: "render.timeout",
      retryable: true,
      safeMessage: "No se pudo generar la imagen. Podés reintentar.",
    },
    occurredAt: "2026-07-28T12:00:00.000Z",
    stage: "generation",
    type: "fail",
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.status, "generation_failed");
  assert.deepEqual(result.state.failure, {
    code: "render.timeout",
    failedAt: "2026-07-28T12:00:00.000Z",
    retryable: true,
    safeMessage: "No se pudo generar la imagen. Podés reintentar.",
  });
});

test("publicada, cancelada y expirada son terminales", () => {
  for (const status of ["published", "cancelled", "expired"] as const) {
    const result = transitionPublication(state(status), command("draft"));
    assert.equal(
      result.ok ? undefined : result.error.code,
      "invalid-transition",
    );
  }
});
