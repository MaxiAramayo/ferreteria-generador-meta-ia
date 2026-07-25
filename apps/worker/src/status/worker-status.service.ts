import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import {
  reportReadiness,
  summarizeDependencies,
  type DependencyProbe,
} from "@aramayo/process-health";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { DEPENDENCY_PROBES, WORKER_CONFIGURATION } from "./status.tokens.ts";

const heartbeatIntervalMs = 30_000;

/**
 * Reporta el estado real del worker sin ejecutar trabajo simulado.
 *
 * El worker todavía no consume colas: eso pertenece a fases posteriores. Aquí
 * solamente se confirma que la configuración es válida, se informa qué
 * integraciones están habilitadas y se publica el estado de las dependencias.
 */
@Injectable()
export class WorkerStatusService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #logger = new Logger("worker");
  readonly #configuration: WorkerConfiguration;
  readonly #probes: readonly DependencyProbe[];
  #heartbeat: NodeJS.Timeout | undefined;

  constructor(
    @Inject(WORKER_CONFIGURATION) configuration: WorkerConfiguration,
    @Inject(DEPENDENCY_PROBES) probes: readonly DependencyProbe[],
  ) {
    this.#configuration = configuration;
    this.#probes = probes;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.#reportStatus("worker.ready");

    this.#heartbeat = setInterval(() => {
      void this.#reportStatus("worker.heartbeat");
    }, heartbeatIntervalMs);
  }

  onApplicationShutdown(signal?: string): void {
    if (this.#heartbeat !== undefined) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = undefined;
    }

    this.#logger.log(`worker.stopped señal=${signal ?? "sin señal"}`);
  }

  async #reportStatus(event: string): Promise<void> {
    const readiness = await reportReadiness("worker", this.#probes);

    this.#logger.log(
      [
        event,
        `estado=${readiness.status}`,
        `dependencias=${summarizeDependencies(readiness)}`,
        `concurrencia=${this.#configuration.concurrency}`,
        `openai=${this.#describeIntegration(this.#configuration.openAi.enabled)}`,
        `cloudinary=${this.#describeIntegration(this.#configuration.cloudinary.enabled)}`,
        `meta=${this.#describeIntegration(this.#configuration.meta.enabled)}`,
      ].join(" "),
    );
  }

  #describeIntegration(enabled: boolean): string {
    return enabled ? "habilitada" : "deshabilitada";
  }
}
