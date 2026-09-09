import assert from "node:assert/strict";
import test from "node:test";

import {
  manualActionForOperationalAlert,
  publicationOperationalAlertFingerprint,
  publicationOperationalAlertPolicy,
  safeActionForPublicationManualReason,
  type PublicationOperationalAlertRecord,
} from "./index.ts";

test("la huella separa ocurrencias reales de una misma recurrencia", () => {
  const first = publicationOperationalAlertFingerprint({
    kind: "occurrence-stuck",
    scheduleOccurrenceId: "10000000-0000-4000-8000-000000000001",
  });
  const second = publicationOperationalAlertFingerprint({
    kind: "occurrence-stuck",
    scheduleOccurrenceId: "10000000-0000-4000-8000-000000000002",
  });

  assert.notEqual(first, second);
});

test("la huella exige el recurso que cada clase necesita", () => {
  assert.throws(
    () =>
      publicationOperationalAlertFingerprint({ kind: "connection-degraded" }),
    RangeError,
  );
  assert.throws(
    () => publicationOperationalAlertFingerprint({ kind: "occurrence-stuck" }),
    RangeError,
  );
  assert.throws(
    () =>
      publicationOperationalAlertFingerprint({
        kind: "publication-manual-action",
      }),
    RangeError,
  );
});

test("las causas detenidas sólo exponen acciones que ya son seguras", () => {
  assert.equal(
    safeActionForPublicationManualReason("outcome-unresolved"),
    "reconcile",
  );
  assert.equal(
    safeActionForPublicationManualReason("attempts-exhausted"),
    "retry",
  );
  assert.equal(
    safeActionForPublicationManualReason("permanent-failure"),
    "retry",
  );
  assert.throws(
    () => safeActionForPublicationManualReason("abandoned-by-operator"),
    RangeError,
  );
});

function alert(
  safeAction: PublicationOperationalAlertRecord["safeAction"],
): PublicationOperationalAlertRecord {
  return {
    cause: "outcome-unresolved",
    fingerprint: "publication-manual-action:target",
    firstObservedAt: "2026-09-08T12:00:00.000Z",
    id: "10000000-0000-4000-8000-000000000001",
    kind: "publication-manual-action",
    lastObservedAt: "2026-09-08T12:00:00.000Z",
    observations: 1,
    publicationId: "20000000-0000-4000-8000-000000000002",
    publicationTarget: "facebook_page",
    safeAction,
    severity: "attention",
  };
}

test("sólo las alertas de destino se traducen a acción manual", () => {
  assert.equal(
    manualActionForOperationalAlert(alert("reconcile")),
    "reconcile",
  );
  assert.equal(manualActionForOperationalAlert(alert("retry")), "retry");
  assert.equal(
    manualActionForOperationalAlert(alert("inspect-queue")),
    undefined,
  );
});

test("los umbrales operativos mantienen un atraso breve y escalamiento cercano", () => {
  assert.equal(
    publicationOperationalAlertPolicy.occurrenceStuckThresholdMilliseconds,
    5 * 60 * 1_000,
  );
  assert.equal(
    publicationOperationalAlertPolicy.nearPublicationWindowMilliseconds,
    30 * 60 * 1_000,
  );
});
