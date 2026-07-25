import { readFile } from "node:fs/promises";

export interface LocalInfrastructureEnvironment {
  readonly postgresDatabase: string;
  readonly postgresPassword: string;
  readonly postgresPort: number;
  readonly postgresUser: string;
  readonly redisPassword: string;
  readonly redisPort: number;
}

type RequiredKey =
  | "POSTGRES_DB"
  | "POSTGRES_PASSWORD"
  | "POSTGRES_PORT"
  | "POSTGRES_USER"
  | "REDIS_PASSWORD"
  | "REDIS_PORT";

function normalizeEnvironmentValue(rawValue: string): string {
  const trimmedValue = rawValue.trim();
  const quote = trimmedValue.at(0);

  if (
    (quote === '"' || quote === "'") &&
    trimmedValue.at(-1) === quote &&
    trimmedValue.length >= 2
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

export function parseEnvironmentContent(
  content: string,
): ReadonlyMap<string, string> {
  const environmentEntries = new Map<string, string>();

  for (const [lineIndex, rawLine] of content.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(
        `.env contiene una asignación inválida en la línea ${lineIndex + 1}.`,
      );
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) {
      throw new Error(
        `.env contiene un nombre inválido en la línea ${lineIndex + 1}.`,
      );
    }
    if (environmentEntries.has(key)) {
      throw new Error(`.env declara ${key} más de una vez.`);
    }

    environmentEntries.set(
      key,
      normalizeEnvironmentValue(line.slice(separatorIndex + 1)),
    );
  }

  return environmentEntries;
}

function readRequiredValue(
  environmentEntries: ReadonlyMap<string, string>,
  key: RequiredKey,
): string {
  const environmentValue = environmentEntries.get(key);
  if (!environmentValue) {
    throw new Error(
      `Falta definir ${key} con un valor local no vacío en .env.`,
    );
  }
  return environmentValue;
}

function parsePort(
  portValue: string,
  key: "POSTGRES_PORT" | "REDIS_PORT",
): number {
  if (!/^\d{1,5}$/u.test(portValue)) {
    throw new Error(`${key} debe ser un puerto TCP válido.`);
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${key} debe estar entre 1 y 65535.`);
  }
  return port;
}

function assertPostgresIdentifier(
  identifier: string,
  key: "POSTGRES_DB" | "POSTGRES_USER",
): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(identifier)) {
    throw new Error(`${key} debe usar minúsculas, números o guion bajo.`);
  }
}

export function buildLocalInfrastructureEnvironment(
  environmentEntries: ReadonlyMap<string, string>,
): LocalInfrastructureEnvironment {
  const postgresDatabase = readRequiredValue(environmentEntries, "POSTGRES_DB");
  const postgresUser = readRequiredValue(environmentEntries, "POSTGRES_USER");
  assertPostgresIdentifier(postgresDatabase, "POSTGRES_DB");
  assertPostgresIdentifier(postgresUser, "POSTGRES_USER");

  return {
    postgresDatabase,
    postgresPassword: readRequiredValue(
      environmentEntries,
      "POSTGRES_PASSWORD",
    ),
    postgresPort: parsePort(
      readRequiredValue(environmentEntries, "POSTGRES_PORT"),
      "POSTGRES_PORT",
    ),
    postgresUser,
    redisPassword: readRequiredValue(environmentEntries, "REDIS_PASSWORD"),
    redisPort: parsePort(
      readRequiredValue(environmentEntries, "REDIS_PORT"),
      "REDIS_PORT",
    ),
  };
}

export async function readLocalInfrastructureEnvironment(
  environmentFilePath: string,
): Promise<LocalInfrastructureEnvironment> {
  let environmentContent: string;
  try {
    environmentContent = await readFile(environmentFilePath, "utf8");
  } catch (cause: unknown) {
    throw new Error(
      "No se pudo leer .env. Copiá .env.example y completá las contraseñas locales.",
      { cause },
    );
  }

  return buildLocalInfrastructureEnvironment(
    parseEnvironmentContent(environmentContent),
  );
}
