import type {
  PublicationOccurrenceClaimSummary,
  PublicationOccurrenceDispatchJob,
  PublicationScheduleDispatchMetrics,
  PublicationScheduleDispatchRepository,
} from "@aramayo/domain";

import type { PublicationOccurrenceQueue } from "./publication-occurrence.queue.ts";

export interface PublicationScheduleDispatchSummary {
  readonly claim: PublicationOccurrenceClaimSummary;
  readonly enqueued: number;
  readonly metrics: PublicationScheduleDispatchMetrics;
}

const recoveryPageSize = 100;

/** Caso de uso sin framework: persiste primero y sólo después toca Redis. */
export class PublicationScheduleDispatchService {
  readonly #queue: PublicationOccurrenceQueue;
  readonly #repository: PublicationScheduleDispatchRepository;

  constructor(
    repository: PublicationScheduleDispatchRepository,
    queue: PublicationOccurrenceQueue,
  ) {
    this.#queue = queue;
    this.#repository = repository;
  }

  async dispatchBatch(
    at: Date,
    limit: number,
  ): Promise<PublicationScheduleDispatchSummary> {
    const instant = at.toISOString();
    const claim = await this.#repository.claimDue({ at: instant, limit });
    await this.#enqueue(claim.jobs);
    return Object.freeze({
      claim,
      enqueued: claim.jobs.length,
      metrics: await this.#repository.dispatchMetrics(instant),
    });
  }

  /**
   * Reconstruye toda la cola pendiente usando páginas estables por UUID.
   *
   * Agregar dos veces es inocuo: BullMQ usa el occurrenceId como `jobId` y
   * conserva jobs completados/fallidos para que la deduplicación no desaparezca.
   */
  async recoverPendingQueue(): Promise<number> {
    let afterOccurrenceId: string | undefined;
    let enqueued = 0;
    for (;;) {
      const jobs = await this.#repository.pendingQueueJobs({
        ...(afterOccurrenceId === undefined ? {} : { afterOccurrenceId }),
        limit: recoveryPageSize,
      });
      await this.#enqueue(jobs);
      enqueued += jobs.length;
      const last = jobs.at(-1);
      if (last === undefined || jobs.length < recoveryPageSize) {
        return enqueued;
      }
      afterOccurrenceId = last.occurrenceId;
    }
  }

  async #enqueue(
    jobs: readonly PublicationOccurrenceDispatchJob[],
  ): Promise<void> {
    for (const job of jobs) {
      await this.#queue.enqueue(job);
    }
  }
}
