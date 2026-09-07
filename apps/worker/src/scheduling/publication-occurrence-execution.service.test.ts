import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type {
  AcquirePublicationOccurrenceInput,
  AcquirePublicationOccurrenceResult,
  CompletePublicationOccurrenceResult,
  HeartbeatPublicationOccurrenceInput,
  PublicationOccurrenceDispatchJob,
  PublicationOccurrenceExecutionLease,
  PublicationOccurrenceExecutionRepository,
} from "@aramayo/domain";

import {
  PublicationOccurrenceExecutionError,
  PublicationOccurrenceExecutionService,
} from "./publication-occurrence-execution.service.ts";

function job(): PublicationOccurrenceDispatchJob {
  return Object.freeze({
    dispatchEventId: randomUUID(),
    occurrenceId: randomUUID(),
    organizationId: randomUUID(),
    scheduleId: randomUUID(),
  });
}

class FakeExecutionRepository implements PublicationOccurrenceExecutionRepository {
  acquireResult: AcquirePublicationOccurrenceResult | undefined;
  completeResult: CompletePublicationOccurrenceResult = Object.freeze({
    orderId: randomUUID(),
    status: "created",
  });
  completeWaitMilliseconds = 0;
  heartbeats: HeartbeatPublicationOccurrenceInput[] = [];
  heartbeatResult: "lost" | "renewed" = "renewed";
  lastAcquire: AcquirePublicationOccurrenceInput | undefined;

  acquire(
    input: AcquirePublicationOccurrenceInput,
  ): Promise<AcquirePublicationOccurrenceResult> {
    this.lastAcquire = input;
    if (this.acquireResult !== undefined) {
      return Promise.resolve(this.acquireResult);
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

  async complete(
    lease: PublicationOccurrenceExecutionLease,
  ): Promise<CompletePublicationOccurrenceResult> {
    void lease;
    if (this.completeWaitMilliseconds > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.completeWaitMilliseconds),
      );
    }
    return this.completeResult;
  }

  heartbeat(
    input: HeartbeatPublicationOccurrenceInput,
  ): Promise<"lost" | "renewed"> {
    this.heartbeats.push(input);
    return Promise.resolve(this.heartbeatResult);
  }
}

test("un job reentregado devuelve la orden que ya completó", async () => {
  const repository = new FakeExecutionRepository();
  const orderId = randomUUID();
  repository.acquireResult = Object.freeze({ orderId, status: "completed" });

  const result = await new PublicationOccurrenceExecutionService(
    repository,
  ).execute(job(), "worker-a");

  assert.deepEqual(result, { orderId, status: "completed" });
});

test("un propietario vigente hace que el segundo worker reintente", async () => {
  const repository = new FakeExecutionRepository();
  const retryAt = "2026-09-07T12:01:00.000Z";
  repository.acquireResult = Object.freeze({ retryAt, status: "busy" });

  await assert.rejects(
    new PublicationOccurrenceExecutionService(repository).execute(
      job(),
      "worker-b",
    ),
    (error: unknown) =>
      error instanceof PublicationOccurrenceExecutionError &&
      error.code === "busy" &&
      error.retryAt === retryAt,
  );
});

test("una operación larga renueva la lease con heartbeat", async () => {
  const repository = new FakeExecutionRepository();
  repository.completeWaitMilliseconds = 25;
  const service = new PublicationOccurrenceExecutionService(repository, {
    heartbeatMilliseconds: 5,
    leaseMilliseconds: 30,
  });

  const result = await service.execute(job(), "worker-a");

  assert.equal(result.status, "created");
  assert.ok(repository.heartbeats.length >= 2);
  assert.ok(
    repository.heartbeats.every((entry) => entry.lease.ownerId === "worker-a"),
  );
});

test("un heartbeat perdido impide atribuirse el resultado", async () => {
  const repository = new FakeExecutionRepository();
  repository.completeWaitMilliseconds = 15;
  repository.heartbeatResult = "lost";
  const service = new PublicationOccurrenceExecutionService(repository, {
    heartbeatMilliseconds: 5,
    leaseMilliseconds: 30,
  });

  await assert.rejects(
    service.execute(job(), "worker-a"),
    (error: unknown) =>
      error instanceof PublicationOccurrenceExecutionError &&
      error.code === "lease-lost",
  );
});

test("un job viejo termina sin crear otra orden", async () => {
  const repository = new FakeExecutionRepository();
  repository.acquireResult = Object.freeze({
    reason: "dispatch-mismatch",
    status: "ignored",
  });

  const result = await new PublicationOccurrenceExecutionService(
    repository,
  ).execute(job(), "worker-a");

  assert.deepEqual(result, {
    reason: "dispatch-mismatch",
    status: "ignored",
  });
});
