import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type {
  AcquirePublicationOccurrenceInput,
  AcquirePublicationOccurrenceResult,
  CompletePublicationOccurrenceResult,
  HeartbeatPublicationOccurrenceInput,
  publicationOccurrenceJobName,
  PublicationOccurrenceClaimSummary,
  PublicationOccurrenceDispatchJob,
  PublicationOccurrenceExecutionLease,
  PublicationOccurrenceExecutionRepository,
  PublicationScheduleDispatchMetrics,
  PublicationScheduleDispatchRepository,
} from "@aramayo/domain";
import { Queue, createNodeRedisClient } from "bullmq";
import { createClient } from "redis";

import {
  BullMqPublicationOccurrenceQueue,
  publicationOccurrenceJobId,
} from "./publication-occurrence.queue.ts";
import { PublicationOccurrenceExecutionService } from "./publication-occurrence-execution.service.ts";
import { PublicationOccurrenceWorkerService } from "./publication-occurrence-worker.service.ts";
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

class PersistentFakeExecutionRepository implements PublicationOccurrenceExecutionRepository {
  acquireCount = 0;
  completeCount = 0;
  readonly orderId = randomUUID();
  readonly #busyOnce: boolean;
  #completed = false;

  constructor(busyOnce = false) {
    this.#busyOnce = busyOnce;
  }

  acquire(
    input: AcquirePublicationOccurrenceInput,
  ): Promise<AcquirePublicationOccurrenceResult> {
    this.acquireCount += 1;
    if (this.#busyOnce && this.acquireCount === 1) {
      return Promise.resolve(
        Object.freeze({
          retryAt: new Date(Date.parse(input.at) + 100).toISOString(),
          status: "busy",
        }),
      );
    }
    if (this.#completed) {
      return Promise.resolve(
        Object.freeze({ orderId: this.orderId, status: "completed" }),
      );
    }
    return Promise.resolve(
      Object.freeze({
        lease: Object.freeze({
          dispatchEventId: input.dispatchEventId,
          expiresAt: input.leaseExpiresAt,
          occurrenceId: input.occurrenceId,
          organizationId: input.organizationId,
          ownerId: input.lockOwnerId,
          scheduleId: input.scheduleId,
          token: input.lockToken,
        }),
        status: "acquired",
      }),
    );
  }

  complete(
    lease: PublicationOccurrenceExecutionLease,
  ): Promise<CompletePublicationOccurrenceResult> {
    void lease;
    this.completeCount += 1;
    this.#completed = true;
    return Promise.resolve(
      Object.freeze({ orderId: this.orderId, status: "created" }),
    );
  }

  heartbeat(
    input: HeartbeatPublicationOccurrenceInput,
  ): Promise<"lost" | "renewed"> {
    void input;
    return Promise.resolve("renewed");
  }
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMilliseconds = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      throw new Error("El consumidor BullMQ no alcanzó el estado esperado.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
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

void test(
  "el consumidor procesa el job y una reentrega reutiliza la orden",
  { timeout: 10_000 },
  async () => {
    const redisUrl = requiredRedisUrl();
    const queueName = `scheduled-publications-worker-${randomUUID()}`;
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
    const repository = new PersistentFakeExecutionRepository(true);
    const worker = new PublicationOccurrenceWorkerService(
      redisUrl,
      2,
      new PublicationOccurrenceExecutionService(repository),
      queueName,
    );
    const dispatchJob = Object.freeze({
      dispatchEventId: randomUUID(),
      occurrenceId: randomUUID(),
      organizationId: randomUUID(),
      scheduleId: randomUUID(),
    });
    const jobId = publicationOccurrenceJobId(dispatchJob.occurrenceId);

    try {
      worker.onApplicationBootstrap();
      await queue.enqueue(dispatchJob);
      await waitUntil(
        async () =>
          (await inspector.getJob(jobId))
            ?.getState()
            .then((state) => state === "completed") ?? false,
      );
      assert.equal(repository.acquireCount, 2);
      assert.equal(repository.completeCount, 1);

      // El mismo job durable puede reconstruirse después de haber terminado;
      // el repositorio devuelve la orden existente y no repite `complete`.
      await queue.enqueue(dispatchJob);
      await waitUntil(() => repository.acquireCount === 3);
      assert.equal(repository.completeCount, 1);
    } finally {
      await worker.onApplicationShutdown();
      await inspector.obliterate({ force: true });
      await inspector.close();
      if (rawInspectorClient.isOpen) {
        await rawInspectorClient.quit();
      }
      await queue.shutdown();
    }
  },
);
