import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type {
  publicationOccurrenceJobName,
  PublicationOccurrenceClaimSummary,
  PublicationOccurrenceDispatchJob,
  PublicationScheduleDispatchMetrics,
  PublicationScheduleDispatchRepository,
} from "@aramayo/domain";
import { Queue, createNodeRedisClient } from "bullmq";
import { createClient } from "redis";

import {
  BullMqPublicationOccurrenceQueue,
  publicationOccurrenceJobId,
} from "./publication-occurrence.queue.ts";
import { PublicationScheduleDispatchService } from "./publication-schedule-dispatch.service.ts";

function requiredRedisUrl(): string {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl === undefined || redisUrl.trim().length === 0) {
    throw new Error("REDIS_URL is required for queue integration tests.");
  }
  return redisUrl;
}

class PersistentFakeRepository implements PublicationScheduleDispatchRepository {
  readonly job: PublicationOccurrenceDispatchJob;
  committed = false;

  constructor(job: PublicationOccurrenceDispatchJob) {
    this.job = job;
  }

  claimDue(): Promise<PublicationOccurrenceClaimSummary> {
    this.committed = true;
    return Promise.resolve(
      Object.freeze({
        dispatchRequested: 1,
        jobs: Object.freeze([this.job]),
        reviewed: 1,
        skipped: 0,
      }),
    );
  }

  dispatchMetrics(): Promise<PublicationScheduleDispatchMetrics> {
    return Promise.resolve(
      Object.freeze({
        backlog: this.committed ? 1 : 0,
        lagMilliseconds: 0,
        queued: this.committed ? 1 : 0,
        unclaimed: 0,
      }),
    );
  }

  pendingQueueJobs(): Promise<readonly PublicationOccurrenceDispatchJob[]> {
    return Promise.resolve(
      this.committed ? Object.freeze([this.job]) : Object.freeze([]),
    );
  }
}

void test("Redis vacío se reconstruye desde la intención persistida", async () => {
  const redisUrl = requiredRedisUrl();
  const queueName = `scheduled-publications-test-${randomUUID()}`;
  const rawInspectorClient = createClient({ url: redisUrl });
  rawInspectorClient.on("error", () => undefined);
  const inspector = new Queue<
    PublicationOccurrenceDispatchJob,
    void,
    typeof publicationOccurrenceJobName
  >(queueName, {
    connection: createNodeRedisClient(rawInspectorClient),
  });
  inspector.on("error", () => undefined);
  const queue = new BullMqPublicationOccurrenceQueue(redisUrl, queueName);
  const dispatchJob = Object.freeze({
    dispatchEventId: randomUUID(),
    occurrenceId: randomUUID(),
    organizationId: randomUUID(),
    scheduleId: randomUUID(),
  });
  const repository = new PersistentFakeRepository(dispatchJob);
  const dispatcher = new PublicationScheduleDispatchService(repository, queue);
  const jobId = publicationOccurrenceJobId(dispatchJob.occurrenceId);

  try {
    await dispatcher.dispatchBatch(new Date("2026-09-04T12:00:00.000Z"), 10);
    assert.ok(await inspector.getJob(jobId));

    await inspector.obliterate({ force: true });
    assert.equal(await inspector.getJob(jobId), undefined);

    assert.equal(await dispatcher.recoverPendingQueue(), 1);
    const recovered = await inspector.getJob(jobId);
    assert.ok(recovered);
    assert.deepEqual(recovered.data, dispatchJob);

    // Una segunda reconstrucción usa el mismo jobId y no duplica la cola.
    assert.equal(await dispatcher.recoverPendingQueue(), 1);
    assert.equal(await inspector.count(), 1);
  } finally {
    await inspector.obliterate({ force: true });
    await inspector.close();
    if (rawInspectorClient.isOpen) {
      await rawInspectorClient.quit();
    }
    await queue.shutdown();
  }
});
