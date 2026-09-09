import { currentCorrelationId } from "@aramayo/observability";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.ts";

/**
 * El cliente estampa la correlación vigente en auditoría y outbox.
 *
 * Se resuelve acá y no en cada repositorio porque más de treinta lugares
 * escriben auditoría: pasar el identificador por argumento en todos ellos
 * garantiza que alguno quede sin él, y una correlación incompleta no sirve para
 * seguir una intención de punta a punta. Un valor explícito en la llamada gana,
 * así un reproceso puede conservar la correlación original.
 *
 * La extensión también alcanza a las escrituras dentro de una transacción, que
 * es donde vive casi toda la auditoría del sistema.
 */
function withCorrelation<Data>(data: Data): Data {
  const correlationId = currentCorrelationId();
  if (
    correlationId === undefined ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    "correlationId" in data
  ) {
    return data;
  }
  return { ...data, correlationId };
}

function withCorrelationMany<Data>(data: Data): Data {
  return Array.isArray(data)
    ? (data.map((entry: unknown) => withCorrelation(entry)) as Data)
    : withCorrelation(data);
}

// El tipo del cliente extendido lo genera Prisma en línea y no tiene nombre
// público que anotar; se publica abajo como `DatabaseClient` a partir de esta
// misma función.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- El tipo extendido de Prisma no es nombrable.
export function createDatabaseClient(databaseUrl: string) {
  const adapter = new PrismaPg({
    application_name: "aramayo-content-platform",
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    max: 10,
  });

  return new PrismaClient({ adapter }).$extends({
    query: {
      auditEvent: {
        create({ args, query }) {
          return query({ ...args, data: withCorrelation(args.data) });
        },
        createMany({ args, query }) {
          return query({ ...args, data: withCorrelationMany(args.data) });
        },
      },
      outboxMessage: {
        create({ args, query }) {
          return query({ ...args, data: withCorrelation(args.data) });
        },
        createMany({ args, query }) {
          return query({ ...args, data: withCorrelationMany(args.data) });
        },
      },
    },
  });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

/**
 * Cliente dentro de una transacción del cliente extendido.
 *
 * `Prisma.TransactionClient` describe el cliente sin extensiones y por eso deja
 * de servir: quien recibe la transacción tiene que ver la misma estampa de
 * correlación que el resto del proceso.
 */
export type DatabaseTransactionClient = Omit<
  DatabaseClient,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction" | "$use"
>;
