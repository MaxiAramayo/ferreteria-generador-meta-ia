import pg from "pg";

import {
  defaultProbeTimeoutMs,
  measureProbe,
  type DependencyProbe,
} from "./dependency-probe.ts";

const { Client } = pg;

/**
 * Abre una conexión por verificación en lugar de reutilizar un pool.
 *
 * Durante el bootstrap el objetivo es detectar credenciales, red o base
 * inexistentes; un pool ocioso puede informar `up` sin haber revalidado nada.
 * Cuando `P2` introduzca Prisma, la readiness usará el pool real detrás de este
 * mismo puerto.
 */
export function createPostgresProbe(
  connectionString: string,
  timeoutMs: number = defaultProbeTimeoutMs,
): DependencyProbe {
  return Object.freeze({
    dependency: "postgres",
    async check() {
      return measureProbe("postgres", async () => {
        const client = new Client({
          connectionString,
          connectionTimeoutMillis: timeoutMs,
          query_timeout: timeoutMs,
          statement_timeout: timeoutMs,
        });
        client.on("error", () => undefined);

        try {
          await client.connect();
          await client.query("SELECT 1");
        } finally {
          await client.end().catch(() => undefined);
        }
      });
    },
  });
}
