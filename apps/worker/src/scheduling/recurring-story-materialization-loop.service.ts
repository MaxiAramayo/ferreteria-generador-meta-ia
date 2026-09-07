import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import type { RecurringStoryMaterializationService } from "./recurring-story-materialization.service.ts";

const intervalMilliseconds = 60_000;
const batchLimit = 100;

export class RecurringStoryMaterializationLoopService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #logger = new Logger("worker");
  readonly #service: RecurringStoryMaterializationService;
  #interval: NodeJS.Timeout | undefined;
  #running = false;

  constructor(service: RecurringStoryMaterializationService) {
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
      if (result.reviewed > 0) {
        this.#logger.log(
          `scheduling.recurring-story reviewed=${String(result.reviewed)} created=${String(result.created)} blocked=${String(result.blocked)}`,
        );
      }
    } catch {
      this.#logger.warn("scheduling.recurring-story.failed");
    } finally {
      this.#running = false;
    }
  }
}
