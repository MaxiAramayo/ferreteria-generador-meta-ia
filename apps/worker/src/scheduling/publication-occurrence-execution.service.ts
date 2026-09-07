import { randomUUID } from "node:crypto";

import type {
  PublicationOccurrenceDispatchJob,
  PublicationOccurrenceExecutionLease,
  PublicationOccurrenceExecutionRepository,
} from "@aramayo/domain";

const defaultLeaseMilliseconds = 60_000;
const defaultHeartbeatMilliseconds = 15_000;

export type PublicationOccurrenceExecutionResult =
  | Readonly<{ orderId: string; status: "completed" | "created" | "replayed" }>
  | Readonly<{
      reason:
        "dispatch-mismatch" | "occurrence-unavailable" | "schedule-inactive";
      status: "ignored";
    }>;

export class PublicationOccurrenceExecutionError extends Error {
  readonly code: "blocked" | "busy" | "lease-lost";
  readonly retryAt?: string;

  constructor(
    code: "blocked" | "busy" | "lease-lost",
    message: string,
    retryAt?: string,
  ) {
    super(message);
    this.code = code;
    this.name = "PublicationOccurrenceExecutionError";
    if (retryAt !== undefined) this.retryAt = retryAt;
  }
}

export interface PublicationOccurrenceExecutionOptions {
  readonly heartbeatMilliseconds?: number;
  readonly leaseMilliseconds?: number;
  readonly now?: () => Date;
  readonly token?: () => string;
}

/** Orquesta la lease; toda decisión de ownership sigue en PostgreSQL. */
export class PublicationOccurrenceExecutionService {
  readonly #heartbeatMilliseconds: number;
  readonly #leaseMilliseconds: number;
  readonly #now: () => Date;
  readonly #repository: PublicationOccurrenceExecutionRepository;
  readonly #token: () => string;

  constructor(
    repository: PublicationOccurrenceExecutionRepository,
    options: PublicationOccurrenceExecutionOptions = {},
  ) {
    this.#heartbeatMilliseconds =
      options.heartbeatMilliseconds ?? defaultHeartbeatMilliseconds;
    this.#leaseMilliseconds =
      options.leaseMilliseconds ?? defaultLeaseMilliseconds;
    this.#now = options.now ?? ((): Date => new Date());
    this.#repository = repository;
    this.#token = options.token ?? randomUUID;
    if (
      this.#heartbeatMilliseconds < 1 ||
      this.#leaseMilliseconds <= this.#heartbeatMilliseconds
    ) {
      throw new RangeError("La lease debe ser mayor que el heartbeat.");
    }
  }

  async execute(
    job: PublicationOccurrenceDispatchJob,
    ownerId: string,
  ): Promise<PublicationOccurrenceExecutionResult> {
    const acquiredAt = this.#now();
    const acquired = await this.#repository.acquire({
      ...job,
      at: acquiredAt.toISOString(),
      leaseExpiresAt: this.#expiresAfter(acquiredAt),
      lockOwnerId: ownerId,
      lockToken: this.#token(),
    });
    switch (acquired.status) {
      case "completed":
        return Object.freeze({
          orderId: acquired.orderId,
          status: "completed",
        });
      case "ignored":
        return acquired;
      case "busy":
        throw new PublicationOccurrenceExecutionError(
          "busy",
          "La ocurrencia pertenece a otro worker.",
          acquired.retryAt,
        );
      case "acquired":
        return this.#completeWithHeartbeat(acquired.lease);
    }
  }

  async #completeWithHeartbeat(
    lease: PublicationOccurrenceExecutionLease,
  ): Promise<PublicationOccurrenceExecutionResult> {
    let heartbeatInFlight: Promise<void> | undefined;
    const heartbeatState: { lost: boolean } = { lost: false };
    const heartbeat = (): void => {
      if (heartbeatInFlight !== undefined) return;
      const at = this.#now();
      heartbeatInFlight = this.#repository
        .heartbeat({
          at: at.toISOString(),
          lease,
          leaseExpiresAt: this.#expiresAfter(at),
        })
        .then((result) => {
          if (result === "lost") heartbeatState.lost = true;
        })
        .catch(() => {
          // Sin confirmación no se asume ownership. `complete` vuelve a hacer
          // CAS y el job se reentrega de forma segura.
          heartbeatState.lost = true;
        })
        .finally(() => {
          heartbeatInFlight = undefined;
        });
    };
    const interval = setInterval(heartbeat, this.#heartbeatMilliseconds);
    interval.unref();
    try {
      const completed = await this.#repository.complete(
        lease,
        this.#now().toISOString(),
      );
      if (completed.status === "lost" || heartbeatState.lost) {
        throw new PublicationOccurrenceExecutionError(
          "lease-lost",
          "La lease venció antes de completar la ocurrencia.",
        );
      }
      if (completed.status === "blocked") {
        throw new PublicationOccurrenceExecutionError(
          "blocked",
          `La ocurrencia quedó bloqueada: ${completed.reason}.`,
        );
      }
      return completed;
    } finally {
      clearInterval(interval);
      await heartbeatInFlight;
    }
  }

  #expiresAfter(at: Date): string {
    return new Date(at.getTime() + this.#leaseMilliseconds).toISOString();
  }
}
