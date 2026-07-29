import type {
  OutboxMessageRecord,
  OutboxRepository,
  OutboxTransport,
} from "@aramayo/domain";

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
  readonly #repository: OutboxRepository;
  readonly #transport: OutboxTransport;
  readonly #workerId: string;

  constructor(
    repository: OutboxRepository,
    transport: OutboxTransport,
    workerId: string,
  ) {
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
      try {
        await this.#transport.deliver(message);
        const confirmed = await this.#repository.markDelivered(
          message.eventId,
          this.#workerId,
          new Date().toISOString(),
        );
        if (confirmed) {
          delivered += 1;
        } else {
          lostLease += 1;
        }
      } catch {
        const failureStatus = await this.#repository.markFailed({
          at: new Date().toISOString(),
          errorCode: "delivery-failed",
          errorMessage: "La entrega outbox falló.",
          eventId: message.eventId,
          retryAt: retryAt(message, at),
          workerId: this.#workerId,
        });
        if (failureStatus === "processing") {
          lostLease += 1;
        } else {
          failed += 1;
        }
      }
    }

    return Object.freeze({
      claimed: messages.length,
      delivered,
      failed,
      lostLease,
    });
  }
}
