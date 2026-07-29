import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  FailOutboxMessageInput,
  OutboxMessageRecord,
  OutboxMessageStatus,
  OutboxRepository,
  OutboxTransport,
} from "@aramayo/domain";

import { OutboxDispatcherService } from "./outbox-dispatcher.service.ts";

const message: OutboxMessageRecord = Object.freeze({
  aggregateId: "publication-1",
  aggregateType: "publication",
  attempts: 1,
  availableAt: "2026-07-28T12:00:00.000Z",
  eventId: "10000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000002",
  payload: Object.freeze({ publicationId: "publication-1" }),
  status: "processing",
  topic: "content.publication.created:v1",
});

class FakeOutboxRepository implements OutboxRepository {
  claimed: readonly OutboxMessageRecord[] = Object.freeze([message]);
  failInput: FailOutboxMessageInput | undefined;
  markFailedResult: OutboxMessageStatus = "pending";
  markDeliveredResult = true;

  claimBatch(): Promise<readonly OutboxMessageRecord[]> {
    return Promise.resolve(this.claimed);
  }

  markDelivered(): Promise<boolean> {
    return Promise.resolve(this.markDeliveredResult);
  }

  markFailed(input: FailOutboxMessageInput): Promise<OutboxMessageStatus> {
    this.failInput = input;
    return Promise.resolve(this.markFailedResult);
  }

  purge(): Promise<Readonly<{ deleted: number }>> {
    return Promise.resolve({ deleted: 0 });
  }
}

class RecordingTransport implements OutboxTransport {
  readonly deliveredEventIds: string[] = [];
  failure: Error | undefined;

  deliver(outboxMessage: OutboxMessageRecord): Promise<void> {
    this.deliveredEventIds.push(outboxMessage.eventId);
    return this.failure === undefined
      ? Promise.resolve()
      : Promise.reject(this.failure);
  }
}

test("confirma una entrega usando eventId como identidad estable", async () => {
  const repository = new FakeOutboxRepository();
  const transport = new RecordingTransport();
  const dispatcher = new OutboxDispatcherService(
    repository,
    transport,
    "worker-1",
  );

  const summary = await dispatcher.dispatchBatch(
    new Date("2026-07-28T12:00:00.000Z"),
    10,
  );

  assert.deepEqual(summary, {
    claimed: 1,
    delivered: 1,
    failed: 0,
    lostLease: 0,
  });
  assert.deepEqual(transport.deliveredEventIds, [message.eventId]);
});

test("un fallo conserva diagnóstico seguro y programa backoff", async () => {
  const repository = new FakeOutboxRepository();
  const transport = new RecordingTransport();
  transport.failure = new Error("provider-secret-value");
  const dispatcher = new OutboxDispatcherService(
    repository,
    transport,
    "worker-1",
  );

  const summary = await dispatcher.dispatchBatch(
    new Date("2026-07-28T12:00:00.000Z"),
    10,
  );

  assert.equal(summary.failed, 1);
  if (repository.failInput === undefined) {
    assert.fail("El fallo no fue persistido.");
  }
  assert.equal(repository.failInput.errorCode, "delivery-failed");
  assert.equal(repository.failInput.errorMessage.includes("secret"), false);
  assert.equal(repository.failInput.retryAt, "2026-07-28T12:00:02.000Z");
});

test("si la entrega ocurrió pero se perdió el lease no confirma éxito local", async () => {
  const repository = new FakeOutboxRepository();
  repository.markDeliveredResult = false;
  const transport = new RecordingTransport();
  const dispatcher = new OutboxDispatcherService(
    repository,
    transport,
    "worker-1",
  );

  const summary = await dispatcher.dispatchBatch(
    new Date("2026-07-28T12:00:00.000Z"),
    10,
  );

  assert.equal(summary.lostLease, 1);
  assert.equal(summary.delivered, 0);
  assert.deepEqual(transport.deliveredEventIds, [message.eventId]);
});

test("si el fallo perdió su lease no atribuye el resultado a otro worker", async () => {
  const repository = new FakeOutboxRepository();
  repository.markFailedResult = "processing";
  const transport = new RecordingTransport();
  transport.failure = new Error("provider unavailable");
  const dispatcher = new OutboxDispatcherService(
    repository,
    transport,
    "worker-1",
  );

  const summary = await dispatcher.dispatchBatch(
    new Date("2026-07-28T12:00:00.000Z"),
    10,
  );

  assert.equal(summary.failed, 0);
  assert.equal(summary.lostLease, 1);
});
