import {
  resolveReadinessStatus,
  type LivenessResponse,
  type ProcessName,
  type ReadinessResponse,
} from "@aramayo/contracts";

import type { DependencyProbe } from "./dependency-probe.ts";

export function reportLiveness(processName: ProcessName): LivenessResponse {
  return Object.freeze({
    checkedAt: new Date().toISOString(),
    process: processName,
    status: "alive",
    uptimeSeconds: Math.floor(process.uptime()),
  });
}

export async function reportReadiness(
  processName: ProcessName,
  probes: readonly DependencyProbe[],
): Promise<ReadinessResponse> {
  const dependencies = await Promise.all(probes.map((probe) => probe.check()));

  return Object.freeze({
    checkedAt: new Date().toISOString(),
    dependencies: Object.freeze(dependencies),
    process: processName,
    status: resolveReadinessStatus(dependencies),
  });
}

export function summarizeDependencies(
  readiness: ReadinessResponse,
): string {
  return readiness.dependencies
    .map((dependency) => `${dependency.dependency}:${dependency.status}`)
    .join(",");
}
