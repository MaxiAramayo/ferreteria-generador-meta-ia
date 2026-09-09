import assert from "node:assert/strict";
import test from "node:test";

import type {
  PublicationOperationalAlertRepository,
  PublicationOperationalAlertSweepInput,
  PublicationOperationalAlertSweepResult,
} from "@aramayo/domain";

import { PublicationOperationalAlertService } from "./publication-operational-alert.service.ts";

class RepositoryDouble implements PublicationOperationalAlertRepository {
  sweepInput: PublicationOperationalAlertSweepInput | null = null;

  listOpen(): Promise<readonly never[]> {
    return Promise.resolve(Object.freeze([]));
  }

  resolve(): Promise<never> {
    return Promise.reject(new Error("El barrido no resuelve alertas."));
  }

  sweep(
    input: PublicationOperationalAlertSweepInput,
  ): Promise<PublicationOperationalAlertSweepResult> {
    this.sweepInput = input;
    return Promise.resolve({ observed: 1, opened: 1, reopened: 0, updated: 0 });
  }
}

test("el barrido usa umbrales de dominio y un reloj inyectable", async () => {
  const repository = new RepositoryDouble();
  const service = new PublicationOperationalAlertService(repository, {
    now: (): Date => new Date("2026-09-08T12:00:00.000Z"),
  });

  const result = await service.sweep();

  assert.deepEqual(result, { observed: 1, opened: 1, reopened: 0, updated: 0 });
  assert.deepEqual(repository.sweepInput, {
    at: "2026-09-08T12:00:00.000Z",
    limit: 100,
    nearPublicationWindowMilliseconds: 1_800_000,
    occurrenceStuckThresholdMilliseconds: 300_000,
  });
});
