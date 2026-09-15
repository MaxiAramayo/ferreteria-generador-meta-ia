import assert from "node:assert/strict";
import test from "node:test";

import {
  occurrenceStatusLabels,
  scheduleStatusLabels,
  scheduleTargetsLabel,
} from "./publication-schedule-presentation.ts";

test("la programación se lee en castellano, sin identificadores internos", () => {
  assert.equal(scheduleStatusLabels.active, "Activa");
  assert.equal(scheduleStatusLabels.paused, "Pausada");
  assert.equal(occurrenceStatusLabels.planned, "Planificada");
  assert.equal(occurrenceStatusLabels.dispatched, "Despachada");
  assert.equal(
    scheduleTargetsLabel(["instagram_feed", "facebook_page"]),
    "Instagram feed · Facebook",
  );
  for (const label of [
    ...Object.values(scheduleStatusLabels),
    ...Object.values(occurrenceStatusLabels),
  ]) {
    assert.doesNotMatch(
      label,
      /_|^[a-z]/u,
      `«${label}» parece un identificador.`,
    );
  }
});
