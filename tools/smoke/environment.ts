/**
 * Entorno determinista para los smoke tests.
 *
 * Los procesos se lanzan con un entorno construido, no heredado: una variable
 * suelta en la terminal del desarrollador (por ejemplo `OPENAI_API_KEY`)
 * cambiaría el resultado de la verificación.
 *
 * Todos los valores son falsos y públicos a propósito. Sirven además como
 * sonda: si alguno aparece en el bundle del navegador o en una respuesta HTTP,
 * hay una fuga de configuración.
 */

/** Puerto reservado sin servicio: garantiza dependencias no disponibles. */
export const unreachablePort = 1;

export const fakeSecrets = Object.freeze({
  cloudinaryApiSecret: "smoke-cloudinary-api-secret-falso",
  databasePassword: "smoke-database-password-falso",
  metaAppSecret: "smoke-meta-app-secret-falso",
  openAiApiKey: "sk-smoke-openai-api-key-falso",
  redisPassword: "smoke-redis-password-falso",
  tokenEncryptionKey: Buffer.from("smoke-token-encryption-key-fake!").toString(
    "base64",
  ),
});

export type SmokeEnvironment = Readonly<Record<string, string>>;

function baseEnvironment(): SmokeEnvironment {
  return {
    APP_TIMEZONE: "America/Argentina/Cordoba",
    NODE_ENV: "test",
    PATH: process.env["PATH"] ?? "",
  };
}

function unreachableDatabaseUrl(): string {
  return `postgresql://smoke:${fakeSecrets.databasePassword}@127.0.0.1:${unreachablePort}/smoke_db`;
}

function unreachableRedisUrl(): string {
  return `redis://smoke:${fakeSecrets.redisPassword}@127.0.0.1:${unreachablePort}`;
}

export function apiEnvironment(port: number): SmokeEnvironment {
  return Object.freeze({
    ...baseEnvironment(),
    AUTH_SESSION_TTL_SECONDS: "43200",
    DATABASE_URL: unreachableDatabaseUrl(),
    PORT: String(port),
    REDIS_URL: unreachableRedisUrl(),
    TOKEN_ENCRYPTION_KEYS: `v1:${fakeSecrets.tokenEncryptionKey}`,
    TRUST_PROXY_HOPS: "0",
    WEB_ORIGIN: "http://localhost:3000",
  });
}

export function workerEnvironment(): SmokeEnvironment {
  return Object.freeze({
    ...baseEnvironment(),
    DATABASE_URL: unreachableDatabaseUrl(),
    REDIS_URL: unreachableRedisUrl(),
    TOKEN_ENCRYPTION_KEYS: `v1:${fakeSecrets.tokenEncryptionKey}`,
    WORKER_CONCURRENCY: "4",
  });
}

/** Conecta los módulos reales con credenciales falsas y sin trabajos en base. */
export function publishingWorkerEnvironment(): SmokeEnvironment {
  return Object.freeze({
    ...workerEnvironment(),
    CLOUDINARY_API_KEY: "smoke-cloudinary-api-key-falso",
    CLOUDINARY_API_SECRET: fakeSecrets.cloudinaryApiSecret,
    CLOUDINARY_CLOUD_NAME: "aramayo-smoke",
    CLOUDINARY_FOLDER: "aramayo/smoke",
    META_APP_ID: "1234567890",
    META_APP_SECRET: fakeSecrets.metaAppSecret,
    META_GRAPH_API_VERSION: "v26.0",
    META_PAGE_ID: "1098765432109876",
    META_REDIRECT_URI: "http://localhost:3001/oauth/meta/callback",
  });
}

/**
 * El panel recibe además secretos de proveedores que nunca le pertenecen. Es
 * intencional: comprueba que Next.js no filtre variables privadas al cliente.
 */
export function webEnvironment(
  port: number,
  apiBaseUrl: string,
): SmokeEnvironment {
  return Object.freeze({
    ...baseEnvironment(),
    CLOUDINARY_API_SECRET: fakeSecrets.cloudinaryApiSecret,
    DATABASE_URL: unreachableDatabaseUrl(),
    META_APP_SECRET: fakeSecrets.metaAppSecret,
    NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    OPENAI_API_KEY: fakeSecrets.openAiApiKey,
    PORT: String(port),
    REDIS_URL: unreachableRedisUrl(),
    TOKEN_ENCRYPTION_KEYS: `v1:${fakeSecrets.tokenEncryptionKey}`,
  });
}

export function withoutVariable(
  environment: SmokeEnvironment,
  variable: string,
): SmokeEnvironment {
  const { [variable]: removed, ...rest } = environment;
  void removed;
  return Object.freeze(rest);
}

export function withVariable(
  environment: SmokeEnvironment,
  variable: string,
  value: string,
): SmokeEnvironment {
  return Object.freeze({ ...environment, [variable]: value });
}

/** Valores que jamás pueden aparecer en el bundle del navegador ni en HTML. */
export function forbiddenClientValues(): readonly string[] {
  return Object.freeze([
    fakeSecrets.cloudinaryApiSecret,
    fakeSecrets.databasePassword,
    fakeSecrets.metaAppSecret,
    fakeSecrets.openAiApiKey,
    fakeSecrets.redisPassword,
    fakeSecrets.tokenEncryptionKey,
  ]);
}
