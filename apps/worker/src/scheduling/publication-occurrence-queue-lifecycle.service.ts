import type { OnApplicationShutdown } from "@nestjs/common";

import type { ManagedPublicationOccurrenceQueue } from "./publication-occurrence.queue.ts";

/** Hace explícito el ownership de la conexión Redis del productor. */
export class PublicationOccurrenceQueueLifecycleService implements OnApplicationShutdown {
  readonly #queue: ManagedPublicationOccurrenceQueue;

  constructor(queue: ManagedPublicationOccurrenceQueue) {
    this.#queue = queue;
  }

  onApplicationShutdown(): Promise<void> {
    return this.#queue.shutdown();
  }
}
