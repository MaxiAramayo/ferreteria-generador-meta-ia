import assert from "node:assert/strict";
import test from "node:test";

import type {
  MaterializePublicationSchedulesInput,
  PublicationScheduleMaterializationRepository,
} from "@aramayo/domain";

import { PublicationScheduleMaterializationService } from "./publication-schedule-materialization.service.ts";

class RecordingRepository implements PublicationScheduleMaterializationRepository {
  input: MaterializePublicationSchedulesInput | undefined;

  materializeDue(input: MaterializePublicationSchedulesInput): Promise<
    Readonly<{
      completed: number;
      created: number;
      expired: number;
      reviewed: number;
    }>
  > {
    this.input = input;
    return Promise.resolve({
      completed: 0,
      created: 2,
      expired: 0,
      reviewed: 1,
    });
  }
}

test("reabastece reglas con un instante explícito y un lote acotado", async () => {
  const repository = new RecordingRepository();
  const service = new PublicationScheduleMaterializationService(repository);

  const result = await service.materialize(
    new Date("2030-01-01T12:00:00.000Z"),
    100,
  );

  assert.deepEqual(result, {
    completed: 0,
    created: 2,
    expired: 0,
    reviewed: 1,
  });
  assert.deepEqual(repository.input, {
    at: "2030-01-01T12:00:00.000Z",
    limit: 100,
  });
});

test("rechaza un lote que puede bloquear el worker", () => {
  const service = new PublicationScheduleMaterializationService(
    new RecordingRepository(),
  );
  assert.throws(() => service.materialize(new Date(), 101), RangeError);
});
