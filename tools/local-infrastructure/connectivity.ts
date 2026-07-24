import pg from "pg";
import { createClient } from "redis";

import type { LocalInfrastructureEnvironment } from "./environment.ts";

const { Client } = pg;

interface DatabaseProbeRow {
  readonly database_name: string;
  readonly probe: number;
}

async function verifyPostgresConnection(
  environment: LocalInfrastructureEnvironment,
): Promise<void> {
  const postgresClient = new Client({
    database: environment.postgresDatabase,
    host: "127.0.0.1",
    password: environment.postgresPassword,
    port: environment.postgresPort,
    user: environment.postgresUser,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await postgresClient.connect();
    const queryResult = await postgresClient.query<DatabaseProbeRow>(
      "SELECT current_database() AS database_name, 1::integer AS probe",
    );
    const probeRow = queryResult.rows[0];
    if (
      !probeRow ||
      probeRow.database_name !== environment.postgresDatabase ||
      probeRow.probe !== 1
    ) {
      throw new Error("PostgreSQL respondió con una base o resultado inesperado.");
    }
  } finally {
    await postgresClient.end().catch(() => undefined);
  }
}

async function verifyRedisConnection(
  environment: LocalInfrastructureEnvironment,
): Promise<void> {
  const redisClient = createClient({
    password: environment.redisPassword,
    socket: {
      connectTimeout: 5_000,
      host: "127.0.0.1",
      port: environment.redisPort,
      reconnectStrategy: false,
    },
  });
  redisClient.on("error", () => undefined);

  try {
    await redisClient.connect();
    const pingResult = await redisClient.ping();
    if (pingResult !== "PONG") {
      throw new Error("Redis respondió con un resultado inesperado.");
    }
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit().catch(() => redisClient.destroy());
    }
  }
}

export async function verifyLocalInfrastructureConnectivity(
  environment: LocalInfrastructureEnvironment,
): Promise<void> {
  await Promise.all([
    verifyPostgresConnection(environment),
    verifyRedisConnection(environment),
  ]);
}
