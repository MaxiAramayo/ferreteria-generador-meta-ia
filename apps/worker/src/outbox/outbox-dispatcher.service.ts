import type {
  OutboxMessageRecord,
  OutboxRepository,
  OutboxTransport,
} from "@aramayo/domain";
import {
  newCorrelationId,
  runWithCorrelation,
  type LogEmitter,
} from "@aramayo/observability";

export interface OutboxDispatchSummary {
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
  readonly lostLease: number;
}

function retryDelayMilliseconds(attempts: number): number {
  return Math.min(15 * 60_000, 2 ** Math.min(attempts, 10) * 1_000);
}

function retryAt(message: OutboxMessageRecord, at: Date): string {
  return new Date(
    at.getTime() + retryDelayMilliseconds(message.attempts),
  ).toISOString();
}

export class OutboxDispatcherService {
  readonly #emitter: LogEmitter | undefined;
  readonly #repository: OutboxRepository;
  readonly #transport: OutboxTransport;
  readonly #workerId: string;

  constructor(
    repository: OutboxRepository,
    transport: OutboxTransport,
    workerId: string,
    emitter?: LogEmitter,
  ) {
    this.#emitter = emitter;
    this.#repository = repository;
    this.#transport = transport;
    this.#workerId = workerId;
  }

  async dispatchBatch(at: Date, limit: number): Promise<OutboxDispatchSummary> {
    const messages = await this.#repository.claimBatch({
      at: at.toISOString(),
      leaseExpiresAt: new Date(at.getTime() + 60_000).toISOString(),
      limit,
      workerId: this.#workerId,
    });
    let delivered = 0;
    let failed = 0;
    let lostLease = 0;

    for (const message of messages) {
      // El trabajo se ejecuta dentro de la correlación de la intención que lo
      // creó: sin esto la cadena se corta al cruzar de proceso y el log del
      // worker no se puede unir con la solicitud que lo originó.
      const outcome = await runWithCorrelation(
        {
          correlationId: message.correlationId ?? newCorrelationId(),
          organizationId: message.organizationId,
        },
        async () => this.#deliver(message, at),
      );
      switch (outcome) {
        case "delivered":
          delivered += 1;
          break;
        case "failed":
          failed += 1;
          break;
        case "lost-lease":
          lostLease += 1;
          break;
      }
    }

    return Object.freeze({
      claimed: messages.length,
      delivered,
      failed,
      lostLease,
    });
  }

  async #deliver(
    message: OutboxMessageRecord,
    at: Date,
  ): Promise<"delivered" | "failed" | "lost-lease"> {
    const startedAt = Date.now();
    try {
      await this.#transport.deliver(message);
      const confirmed = await this.#repository.markDelivered(
        message.eventId,
        this.#workerId,
        new Date().toISOString(),
      );
      this.#log(message, startedAt, confirmed ? "delivered" : "lost-lease");
      return confirmed ? "delivered" : "lost-lease";
    } catch {
      const failureStatus = await this.#repository.markFailed({
        at: new Date().toISOString(),
        errorCode: "delivery-failed",
        errorMessage: "La entrega outbox falló.",
        eventId: message.eventId,
        retryAt: retryAt(message, at),
        workerId: this.#workerId,
      });
      const outcome = failureStatus === "processing" ? "lost-lease" : "failed";
      this.#log(message, startedAt, outcome);
      return outcome;
    }
  }

  #log(
    message: OutboxMessageRecord,
    startedAt: number,
    result: "delivered" | "failed" | "lost-lease",
  ): void {
    this.#emitter?.emit({
      detail: {
        attempts: message.attempts,
        eventId: message.eventId,
        result,
        topic: message.topic,
      },
      durationMs: Date.now() - startedAt,
      event: "worker.outbox.delivery",
      level: result === "delivered" ? "info" : "warn",
      outcome: result === "delivered" ? "success" : "failure",
    });
  }
}
