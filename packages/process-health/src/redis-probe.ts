import { createClient } from "redis";

import {
  defaultProbeTimeoutMs,
  measureProbe,
  type DependencyProbe,
} from "./dependency-probe.ts";

export function createRedisProbe(
  connectionUrl: string,
  timeoutMs: number = defaultProbeTimeoutMs,
): DependencyProbe {
  return Object.freeze({
    dependency: "redis",
    async check() {
      return measureProbe("redis", async () => {
        const client = createClient({
          socket: {
            connectTimeout: timeoutMs,
            reconnectStrategy: false,
          },
          url: connectionUrl,
        });
        client.on("error", () => undefined);

        try {
          await client.connect();
          const pingResult = await client.ping();
          if (pingResult !== "PONG") {
            throw new Error("Redis respondió con un resultado inesperado.");
          }
        } finally {
          if (client.isOpen) {
            await client.quit().catch(() => {
              client.destroy();
            });
          }
        }
      });
    },
  });
}
