import assert from "node:assert/strict";
import { test } from "node:test";

import type { RecurringStoryMaterializationRepository } from "@aramayo/domain";

import { RecurringStoryMaterializationService } from "./recurring-story-materialization.service.ts";

class RecordingRepository implements RecurringStoryMaterializationRepository {
  input: Readonly<{ at: string; limit: number }> | undefined;

  materializeDue(
    input: Readonly<{ at: string; limit: number }>,
  ): Promise<Readonly<{ blocked: number; created: number; reviewed: number }>> {
    this.input = input;
    return Promise.resolve({ blocked: 1, created: 2, reviewed: 3 });
  }
}

test("materializa un lote acotado usando un instante explícito", async () => {
  const repository = new RecordingRepository();
  const service = new RecurringStoryMaterializationService(repository);

  const result = await service.materialize(
    new Date("2026-09-07T18:00:00.000Z"),
    25,
  );

  assert.deepEqual(repository.input, {
    at: "2026-09-07T18:00:00.000Z",
    limit: 25,
  });
  assert.deepEqual(result, { blocked: 1, created: 2, reviewed: 3 });
});

test("rechaza lotes capaces de agotar el worker", () => {
  const service = new RecurringStoryMaterializationService(
    new RecordingRepository(),
  );
  assert.throws(() => service.materialize(new Date(), 501), RangeError);
});
