import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { workerLog } from "../observability/worker-log.ts";
import { OutboxDispatcherService } from "./outbox-dispatcher.service.ts";

const dispatchIntervalMilliseconds = 1_000;

@Injectable()
export class OutboxConsumerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #dispatcher: OutboxDispatcherService;
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
        workerLog.emit({
          detail: {
            claimed: result.claimed,
            delivered: result.delivered,
            failed: result.failed,
            lostLease: result.lostLease,
          },
          event: "worker.outbox.batch",
          level: result.failed > 0 ? "warn" : "info",
          outcome: result.failed > 0 ? "degraded" : "success",
        });
      }
    } catch {
      workerLog.emit({
        event: "worker.outbox.batch",
        level: "error",
        outcome: "failure",
      });
    } finally {
      this.#running = false;
    }
  }
}
