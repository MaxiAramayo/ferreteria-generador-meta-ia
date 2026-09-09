import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import { emitDependencyObservation } from "@aramayo/observability";
import {
  reportReadiness,
  summarizeDependencies,
  type DependencyProbe,
} from "@aramayo/process-health";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import { workerLog } from "../observability/worker-log.ts";
import { DEPENDENCY_PROBES, WORKER_CONFIGURATION } from "./status.tokens.ts";

const heartbeatIntervalMs = 30_000;

/**
 * Reporta el estado real del worker sin ejecutar trabajo simulado.
 *
 * El consumo durable se registra en el módulo outbox. Este servicio confirma
 * configuración, integraciones y estado de dependencias sin ejecutar trabajos
 * de prueba.
 */
@Injectable()
export class WorkerStatusService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
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

    workerLog.emit({
      detail: { signal: signal ?? "sin señal" },
      event: "worker.stopped",
      outcome: "success",
    });
  }

  async #reportStatus(event: string): Promise<void> {
    const readiness = await reportReadiness("worker", this.#probes);
    // La sonda ya midió la latencia; publicarla deja a PostgreSQL y Redis en la
    // misma serie observable que los proveedores externos.
    for (const dependency of readiness.dependencies) {
      emitDependencyObservation(
        workerLog,
        { dependency: dependency.dependency, operation: "probe" },
        dependency.status === "up" ? "success" : "failure",
        dependency.latencyMs,
        dependency.status === "up" ? undefined : "unreachable",
      );
    }

    workerLog.emit({
      detail: {
        cloudinary: this.#describeIntegration(
          this.#configuration.cloudinary.enabled,
        ),
        concurrency: this.#configuration.concurrency,
        dependencies: summarizeDependencies(readiness),
        meta: this.#describeIntegration(this.#configuration.meta.enabled),
        openai: this.#describeIntegration(this.#configuration.openAi.enabled),
        readiness: readiness.status,
      },
      event,
      level: readiness.status === "ready" ? "info" : "warn",
      outcome: readiness.status === "ready" ? "success" : "degraded",
    });
  }

  #describeIntegration(enabled: boolean): string {
    return enabled ? "habilitada" : "deshabilitada";
  }
}
