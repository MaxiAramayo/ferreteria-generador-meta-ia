import type { LivenessResponse, ReadinessResponse } from "@aramayo/contracts";
import { emitDependencyObservation } from "@aramayo/observability";
import {
  reportLiveness,
  reportReadiness,
  type DependencyProbe,
} from "@aramayo/process-health";
import { Inject, Injectable } from "@nestjs/common";

import { apiLog } from "../observability/api-log.ts";
import { DEPENDENCY_PROBES } from "./health.tokens.ts";

@Injectable()
export class ProcessHealthService {
  readonly #probes: readonly DependencyProbe[];

  constructor(@Inject(DEPENDENCY_PROBES) probes: readonly DependencyProbe[]) {
    this.#probes = probes;
  }

  inspectLiveness(): LivenessResponse {
    return reportLiveness("api");
  }

  async inspectReadiness(): Promise<ReadinessResponse> {
    const readiness = await reportReadiness("api", this.#probes);
    // La sonda ya midió la latencia: publicarla como observación deja a
    // PostgreSQL y Redis en la misma serie que los proveedores externos, sin
    // consultarlos una segunda vez.
    for (const dependency of readiness.dependencies) {
      emitDependencyObservation(
        apiLog,
        { dependency: dependency.dependency, operation: "probe" },
        dependency.status === "up" ? "success" : "failure",
        dependency.latencyMs,
        dependency.status === "up" ? undefined : "unreachable",
      );
    }
    return readiness;
  }
}
