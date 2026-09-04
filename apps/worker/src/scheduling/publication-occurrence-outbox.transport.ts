import {
  publicationOccurrenceDispatchTopic,
  type OutboxMessageRecord,
  type OutboxTransport,
  type PublicationOccurrenceDispatchJob,
} from "@aramayo/domain";

import type { PublicationOccurrenceQueue } from "./publication-occurrence.queue.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requiredUuid(
  payload: OutboxMessageRecord["payload"],
  field: "dispatchEventId" | "occurrenceId" | "scheduleId",
): string {
  const candidate = payload[field];
  if (typeof candidate !== "string" || !uuidPattern.test(candidate)) {
    throw new TypeError(`El evento de programación no conserva ${field}.`);
  }
  return candidate;
}

/** Traduce el outbox durable al job idempotente y mínimo de BullMQ. */
export class PublicationOccurrenceOutboxTransport implements OutboxTransport {
  readonly #queue: PublicationOccurrenceQueue;

  constructor(queue: PublicationOccurrenceQueue) {
    this.#queue = queue;
  }

  async deliver(message: OutboxMessageRecord): Promise<void> {
    if (message.topic !== publicationOccurrenceDispatchTopic) {
      throw new Error("El evento outbox no corresponde a una programación.");
    }
    const dispatchEventId = requiredUuid(message.payload, "dispatchEventId");
    if (dispatchEventId !== message.eventId) {
      throw new Error("La identidad del evento de programación no coincide.");
    }
    const job: PublicationOccurrenceDispatchJob = Object.freeze({
      dispatchEventId,
      occurrenceId: requiredUuid(message.payload, "occurrenceId"),
      organizationId: message.organizationId,
      scheduleId: requiredUuid(message.payload, "scheduleId"),
    });
    await this.#queue.enqueue(job);
  }
}
