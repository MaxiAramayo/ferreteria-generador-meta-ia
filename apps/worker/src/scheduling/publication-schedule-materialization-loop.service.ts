import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import type { PublicationScheduleMaterializationService } from "./publication-schedule-materialization.service.ts";

const intervalMilliseconds = 60_000;
const batchLimit = 100;

/** Mantiene el horizonte de reglas activas sin mezclarse con el dispatcher. */
export class PublicationScheduleMaterializationLoopService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #logger = new Logger("worker");
  readonly #service: PublicationScheduleMaterializationService;
  #interval: NodeJS.Timeout | undefined;
  #running = false;

  constructor(service: PublicationScheduleMaterializationService) {
    this.#service = service;
  }

  onApplicationBootstrap(): void {
    void this.run();
    this.#interval = setInterval(() => {
      void this.run();
    }, intervalMilliseconds);
  }

  onApplicationShutdown(): void {
    if (this.#interval !== undefined) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
  }

  async run(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      const result = await this.#service.materialize(new Date(), batchLimit);
      if (result.created > 0 || result.completed > 0 || result.expired > 0) {
        this.#logger.log(
          `scheduling.materialization reviewed=${String(result.reviewed)} created=${String(result.created)} completed=${String(result.completed)} expired=${String(result.expired)}`,
        );
      }
    } catch {
      this.#logger.warn("scheduling.materialization.failed");
    } finally {
      this.#running = false;
    }
  }
}
