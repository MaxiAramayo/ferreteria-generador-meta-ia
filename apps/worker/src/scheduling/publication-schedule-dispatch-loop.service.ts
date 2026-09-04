import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import type { PublicationScheduleDispatchService } from "./publication-schedule-dispatch.service.ts";

const dispatchIntervalMilliseconds = 1_000;
const recoveryIntervalMilliseconds = 30_000;
const dispatchLimit = 100;

/** Ciclo periódico; el caso de uso y el repositorio siguen siendo testeables. */
export class PublicationScheduleDispatchLoopService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #dispatcher: PublicationScheduleDispatchService;
  readonly #logger = new Logger("worker");
  #dispatchInterval: NodeJS.Timeout | undefined;
  #dispatchRunning = false;
  #recoveryInterval: NodeJS.Timeout | undefined;
  #recoveryRunning = false;

  constructor(dispatcher: PublicationScheduleDispatchService) {
    this.#dispatcher = dispatcher;
  }

  onApplicationBootstrap(): void {
    void this.dispatch();
    void this.recover();
    this.#dispatchInterval = setInterval(() => {
      void this.dispatch();
    }, dispatchIntervalMilliseconds);
    this.#recoveryInterval = setInterval(() => {
      void this.recover();
    }, recoveryIntervalMilliseconds);
  }

  onApplicationShutdown(): void {
    if (this.#dispatchInterval !== undefined) {
      clearInterval(this.#dispatchInterval);
      this.#dispatchInterval = undefined;
    }
    if (this.#recoveryInterval !== undefined) {
      clearInterval(this.#recoveryInterval);
      this.#recoveryInterval = undefined;
    }
  }

  async dispatch(): Promise<void> {
    if (this.#dispatchRunning) return;
    this.#dispatchRunning = true;
    try {
      const result = await this.#dispatcher.dispatchBatch(
        new Date(),
        dispatchLimit,
      );
      if (result.claim.reviewed > 0 || result.metrics.backlog > 0) {
        this.#logger.log(
          `scheduling.dispatch reviewed=${String(result.claim.reviewed)} requested=${String(result.claim.dispatchRequested)} skipped=${String(result.claim.skipped)} enqueued=${String(result.enqueued)} backlog=${String(result.metrics.backlog)} unclaimed=${String(result.metrics.unclaimed)} queued=${String(result.metrics.queued)} lagMs=${String(result.metrics.lagMilliseconds)}`,
        );
      }
    } catch {
      this.#logger.warn("scheduling.dispatch.failed");
    } finally {
      this.#dispatchRunning = false;
    }
  }

  async recover(): Promise<void> {
    if (this.#recoveryRunning) return;
    this.#recoveryRunning = true;
    try {
      const enqueued = await this.#dispatcher.recoverPendingQueue();
      if (enqueued > 0) {
        this.#logger.log(`scheduling.recovery enqueued=${String(enqueued)}`);
      }
    } catch {
      this.#logger.warn("scheduling.recovery.failed");
    } finally {
      this.#recoveryRunning = false;
    }
  }
}
