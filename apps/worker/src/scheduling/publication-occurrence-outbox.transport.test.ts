import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  publicationOccurrenceDispatchTopic,
  type OutboxMessageRecord,
  type PublicationOccurrenceDispatchJob,
} from "@aramayo/domain";

import type { PublicationOccurrenceQueue } from "./publication-occurrence.queue.ts";
import { PublicationOccurrenceOutboxTransport } from "./publication-occurrence-outbox.transport.ts";

class RecordingQueue implements PublicationOccurrenceQueue {
  job: PublicationOccurrenceDispatchJob | undefined;

  enqueue(job: PublicationOccurrenceDispatchJob): Promise<void> {
    this.job = job;
    return Promise.resolve();
  }
}

function message(
  overrides: Partial<OutboxMessageRecord> = {},
): OutboxMessageRecord {
  const eventId = randomUUID();
  return Object.freeze({
    aggregateId: randomUUID(),
    aggregateType: "publication_schedule_occurrence",
    attempts: 1,
    availableAt: "2026-09-04T12:00:00.000Z",
    eventId,
    organizationId: randomUUID(),
    payload: Object.freeze({
      dispatchEventId: eventId,
      occurrenceId: randomUUID(),
      scheduleId: randomUUID(),
    }),
    status: "processing",
    topic: publicationOccurrenceDispatchTopic,
    ...overrides,
  });
}

test("entrega el payload mínimo con la organización autoritativa del outbox", async () => {
  const queue = new RecordingQueue();
  const outboxMessage = message();

  await new PublicationOccurrenceOutboxTransport(queue).deliver(outboxMessage);

  assert.deepEqual(queue.job, {
    dispatchEventId: outboxMessage.eventId,
    occurrenceId: outboxMessage.payload["occurrenceId"],
    organizationId: outboxMessage.organizationId,
    scheduleId: outboxMessage.payload["scheduleId"],
  });
});

test("rechaza un tópico ajeno o una identidad de evento divergente", async () => {
  const transport = new PublicationOccurrenceOutboxTransport(
    new RecordingQueue(),
  );
  await assert.rejects(
    transport.deliver(message({ topic: "content.publication.created:v1" })),
    /no corresponde/u,
  );
  await assert.rejects(
    transport.deliver(
      message({
        payload: Object.freeze({
          dispatchEventId: randomUUID(),
          occurrenceId: randomUUID(),
          scheduleId: randomUUID(),
        }),
      }),
    ),
    /no coincide/u,
  );
});
