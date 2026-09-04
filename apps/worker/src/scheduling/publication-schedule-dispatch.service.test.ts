import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type {
  PublicationOccurrenceClaimSummary,
  PublicationOccurrenceDispatchJob,
  PublicationScheduleDispatchMetrics,
  PublicationScheduleDispatchRepository,
} from "@aramayo/domain";

import type { PublicationOccurrenceQueue } from "./publication-occurrence.queue.ts";
import { PublicationScheduleDispatchService } from "./publication-schedule-dispatch.service.ts";

function job(): PublicationOccurrenceDispatchJob {
  return Object.freeze({
    dispatchEventId: randomUUID(),
    occurrenceId: randomUUID(),
    organizationId: randomUUID(),
    scheduleId: randomUUID(),
  });
}

class FakeDispatchRepository implements PublicationScheduleDispatchRepository {
  readonly pending: PublicationOccurrenceDispatchJob[] = [];
  claimFailure: Error | undefined;
  claimJobs: readonly PublicationOccurrenceDispatchJob[] = [];
  metrics: PublicationScheduleDispatchMetrics = Object.freeze({
    backlog: 0,
    lagMilliseconds: 0,
    queued: 0,
    unclaimed: 0,
  });

  claimDue(): Promise<PublicationOccurrenceClaimSummary> {
    if (this.claimFailure !== undefined) {
      return Promise.reject(this.claimFailure);
    }
    this.pending.push(...this.claimJobs);
    return Promise.resolve(
      Object.freeze({
        dispatchRequested: this.claimJobs.length,
        jobs: this.claimJobs,
        reviewed: this.claimJobs.length,
        skipped: 0,
      }),
    );
  }

  dispatchMetrics(): Promise<PublicationScheduleDispatchMetrics> {
    return Promise.resolve(this.metrics);
  }

  pendingQueueJobs(
    input: Readonly<{ afterOccurrenceId?: string; limit: number }>,
  ): Promise<readonly PublicationOccurrenceDispatchJob[]> {
    const after = input.afterOccurrenceId;
    const eligible = [...this.pending]
      .sort((left, right) =>
        left.occurrenceId.localeCompare(right.occurrenceId),
      )
      .filter((pendingJob) =>
        after === undefined ? true : pendingJob.occurrenceId > after,
      );
    return Promise.resolve(Object.freeze(eligible.slice(0, input.limit)));
  }
}

class RecordingQueue implements PublicationOccurrenceQueue {
  readonly jobs: PublicationOccurrenceDispatchJob[] = [];
  failure: Error | undefined;

  enqueue(dispatchJob: PublicationOccurrenceDispatchJob): Promise<void> {
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }
    this.jobs.push(dispatchJob);
    return Promise.resolve();
  }
}

test("persiste antes de encolar y expone backlog y atraso", async () => {
  const repository = new FakeDispatchRepository();
  const expectedJob = job();
  repository.claimJobs = Object.freeze([expectedJob]);
  repository.metrics = Object.freeze({
    backlog: 1,
    lagMilliseconds: 2_000,
    queued: 1,
    unclaimed: 0,
  });
  const queue = new RecordingQueue();

  const result = await new PublicationScheduleDispatchService(
    repository,
    queue,
  ).dispatchBatch(new Date("2026-09-04T12:00:00.000Z"), 10);

  assert.deepEqual(queue.jobs, [expectedJob]);
  assert.deepEqual(result.metrics, repository.metrics);
  assert.equal(result.claim.dispatchRequested, 1);
});

test("una caída antes del commit no alcanza Redis", async () => {
  const repository = new FakeDispatchRepository();
  repository.claimFailure = new Error("transaction aborted");
  const queue = new RecordingQueue();
  const dispatcher = new PublicationScheduleDispatchService(repository, queue);

  await assert.rejects(
    dispatcher.dispatchBatch(new Date("2026-09-04T12:00:00.000Z"), 10),
    /transaction aborted/u,
  );
  assert.equal(queue.jobs.length, 0);
});

test("una caída después del commit conserva trabajo reconstruible", async () => {
  const repository = new FakeDispatchRepository();
  const expectedJob = job();
  repository.claimJobs = Object.freeze([expectedJob]);
  const failedQueue = new RecordingQueue();
  failedQueue.failure = new Error("redis unavailable");
  const dispatcher = new PublicationScheduleDispatchService(
    repository,
    failedQueue,
  );

  await assert.rejects(
    dispatcher.dispatchBatch(new Date("2026-09-04T12:00:00.000Z"), 10),
    /redis unavailable/u,
  );
  assert.deepEqual(repository.pending, [expectedJob]);

  const recoveredQueue = new RecordingQueue();
  const recovered = await new PublicationScheduleDispatchService(
    repository,
    recoveredQueue,
  ).recoverPendingQueue();
  assert.equal(recovered, 1);
  assert.deepEqual(recoveredQueue.jobs, [expectedJob]);
});

test("la reconstrucción pagina sin dejar ocurrencias detrás", async () => {
  const repository = new FakeDispatchRepository();
  repository.pending.push(...Array.from({ length: 205 }, job));
  const queue = new RecordingQueue();

  const recovered = await new PublicationScheduleDispatchService(
    repository,
    queue,
  ).recoverPendingQueue();

  assert.equal(recovered, 205);
  assert.equal(queue.jobs.length, 205);
});
