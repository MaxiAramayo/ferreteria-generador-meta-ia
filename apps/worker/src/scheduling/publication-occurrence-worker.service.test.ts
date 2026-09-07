import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { parsePublicationOccurrenceJob } from "./publication-occurrence-worker.service.ts";

test("el consumidor valida y minimiza el payload que llega desde Redis", () => {
  const payload = {
    dispatchEventId: randomUUID(),
    ignored: "no cruza la frontera",
    occurrenceId: randomUUID(),
    organizationId: randomUUID(),
    scheduleId: randomUUID(),
  };

  assert.deepEqual(parsePublicationOccurrenceJob(payload), {
    dispatchEventId: payload.dispatchEventId,
    occurrenceId: payload.occurrenceId,
    organizationId: payload.organizationId,
    scheduleId: payload.scheduleId,
  });
});

test("un identificador inválido no llega al repositorio", () => {
  assert.throws(
    () =>
      parsePublicationOccurrenceJob({
        dispatchEventId: randomUUID(),
        occurrenceId: "../../../otro-tenant",
        organizationId: randomUUID(),
        scheduleId: randomUUID(),
      }),
    /occurrenceId/u,
  );
});
