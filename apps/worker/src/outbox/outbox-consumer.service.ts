import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { OutboxDispatcherService } from "./outbox-dispatcher.service.ts";

const dispatchIntervalMilliseconds = 1_000;

@Injectable()
export class OutboxConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #dispatcher: OutboxDispatcherService;
  readonly #logger = new Logger("worker");
  #interval: NodeJS.Timeout | undefined;
  #running = false;

  constructor(dispatcher: OutboxDispatcherService) {
    this.#dispatcher = dispatcher;
  }

  onApplicationBootstrap(): void {
    void this.#dispatch();
    this.#interval = setInterval(() => {
      void this.#dispatch();
    }, dispatchIntervalMilliseconds);
  }

  onApplicationShutdown(): void {
    if (this.#interval !== undefined) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
  }

  async #dispatch(): Promise<void> {
    if (this.#running) {
      return;
    }
    this.#running = true;
    try {
      const result = await this.#dispatcher.dispatchBatch(new Date(), 20);
      if (result.claimed > 0) {
        this.#logger.log(
          `outbox.batch claimed=${result.claimed} delivered=${result.delivered} failed=${result.failed} lostLease=${result.lostLease}`,
        );
      }
    } catch {
      this.#logger.warn("outbox.batch.failed");
    } finally {
      this.#running = false;
    }
  }
}
