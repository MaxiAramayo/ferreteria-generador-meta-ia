import type { LivenessResponse, ReadinessResponse } from "@aramayo/contracts";
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { ProcessHealthService } from "./process-health.service.ts";

/**
 * `GET /health` es liveness: responde mientras el proceso esté vivo y no debe
 * usarse para decidir si el balanceador puede enviar tráfico.
 *
 * `GET /ready` es readiness: consulta PostgreSQL y Redis y responde `503`
 * cuando alguna dependencia no está disponible.
 */
@Controller()
export class HealthController {
  readonly #health: ProcessHealthService;

  constructor(health: ProcessHealthService) {
    this.#health = health;
  }

  @Get("health")
  readLiveness(): LivenessResponse {
    return this.#health.inspectLiveness();
  }

  @Get("ready")
  async readReadiness(): Promise<ReadinessResponse> {
    const readiness = await this.#health.inspectReadiness();

    if (readiness.status !== "ready") {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}
