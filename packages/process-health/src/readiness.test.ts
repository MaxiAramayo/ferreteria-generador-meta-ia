import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostgresProbe } from "./postgres-probe.ts";
import { createRedisProbe } from "./redis-probe.ts";
import {
  reportLiveness,
  reportReadiness,
  summarizeDependencies,
} from "./readiness.ts";
import type { DependencyProbe } from "./dependency-probe.ts";

/** Puerto reservado sin servicio: produce ECONNREFUSED inmediato. */
const unreachablePort = 1;
const probeTimeoutMs = 1_000;

function stubProbe(
  dependency: DependencyProbe["dependency"],
  status: "up" | "down",
): DependencyProbe {
  return {
    dependency,
    check: () => Promise.resolve({ dependency, latencyMs: 0, status }),
  };
}

test("liveness no consulta dependencias y siempre reporta el proceso vivo", () => {
  const liveness = reportLiveness("api");

  assert.equal(liveness.process, "api");
  assert.equal(liveness.status, "alive");
  assert.ok(liveness.uptimeSeconds >= 0);
  assert.ok(!Number.isNaN(Date.parse(liveness.checkedAt)));
});

test("readiness agrega el estado de cada sonda", async () => {
  const readiness = await reportReadiness("worker", [
    stubProbe("postgres", "up"),
    stubProbe("redis", "up"),
  ]);

  assert.equal(readiness.process, "worker");
  assert.equal(readiness.status, "ready");
  assert.equal(summarizeDependencies(readiness), "postgres:up,redis:up");
});

test("una dependencia inalcanzable deja el proceso not_ready sin lanzar", async () => {
  const readiness = await reportReadiness("api", [
    createPostgresProbe(
      `postgresql://probe:probe@127.0.0.1:${unreachablePort}/probe`,
      probeTimeoutMs,
    ),
    createRedisProbe(
      `redis://probe:probe@127.0.0.1:${unreachablePort}`,
      probeTimeoutMs,
    ),
  ]);

  assert.equal(readiness.status, "not_ready");
  assert.equal(summarizeDependencies(readiness), "postgres:down,redis:down");
  for (const dependency of readiness.dependencies) {
    assert.ok(dependency.latencyMs >= 0);
  }
});

test("el reporte no incluye credenciales ni mensajes del proveedor", async () => {
  const readiness = await reportReadiness("api", [
    createPostgresProbe(
      `postgresql://usuario:secreto-de-prueba@127.0.0.1:${unreachablePort}/probe`,
      probeTimeoutMs,
    ),
  ]);

  assert.ok(!JSON.stringify(readiness).includes("secreto-de-prueba"));
  assert.deepEqual(Object.keys(readiness.dependencies[0] ?? {}).sort(), [
    "dependency",
    "latencyMs",
    "status",
  ]);
});
