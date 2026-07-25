import type { LivenessResponse, ReadinessResponse } from "@aramayo/contracts";
import {
  reportLiveness,
  reportReadiness,
  type DependencyProbe,
} from "@aramayo/process-health";
import { Inject, Injectable } from "@nestjs/common";

import { DEPENDENCY_PROBES } from "./health.tokens.ts";

@Injectable()
export class ProcessHealthService {
  readonly #probes: readonly DependencyProbe[];

  constructor(
    @Inject(DEPENDENCY_PROBES) probes: readonly DependencyProbe[],
  ) {
    this.#probes = probes;
  }

  inspectLiveness(): LivenessResponse {
    return reportLiveness("api");
  }

  inspectReadiness(): Promise<ReadinessResponse> {
    return reportReadiness("api", this.#probes);
  }
}
