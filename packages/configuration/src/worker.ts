import {
  parseCloudinaryIntegration,
  parseMetaIntegration,
  parseOpenAiIntegration,
  type CloudinaryCredentials,
  type MetaCredentials,
  type OpenAICredentials,
} from "./providers.ts";
import type {
  CommonConfiguration,
  EncryptionKeyRing,
  OptionalIntegration,
  RawEnvironment,
  SecretValue,
} from "./types.ts";
import {
  parseCommonConfiguration,
  parseEncryptionKeyRing,
  parseInteger,
  parseOptionalAbsolutePath,
  parsePrivateServiceUrl,
} from "./validation.ts";

export interface WorkerConfiguration extends CommonConfiguration {
  readonly chromiumExecutablePath?: string;
  readonly cloudinary: OptionalIntegration<CloudinaryCredentials>;
  readonly concurrency: number;
  readonly databaseUrl: SecretValue;
  readonly meta: OptionalIntegration<MetaCredentials>;
  readonly openAi: OptionalIntegration<OpenAICredentials>;
  readonly redisUrl: SecretValue;
  readonly tokenEncryption: EncryptionKeyRing;
}

export function parseWorkerEnvironment(
  rawEnvironment: RawEnvironment,
): WorkerConfiguration {
  const commonConfiguration = parseCommonConfiguration(
    rawEnvironment,
    "worker",
  );
  const chromiumExecutablePath = parseOptionalAbsolutePath(
    rawEnvironment,
    "worker",
    "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  );

  return Object.freeze({
    ...commonConfiguration,
    ...(chromiumExecutablePath === undefined ? {} : { chromiumExecutablePath }),
    cloudinary: parseCloudinaryIntegration(rawEnvironment, "worker"),
    concurrency: parseInteger(rawEnvironment, "worker", "WORKER_CONCURRENCY", {
      maximum: 64,
      minimum: 1,
    }),
    databaseUrl: parsePrivateServiceUrl(
      rawEnvironment,
      "worker",
      "DATABASE_URL",
    ),
    meta: parseMetaIntegration(
      rawEnvironment,
      "worker",
      commonConfiguration.environment,
    ),
    openAi: parseOpenAiIntegration(rawEnvironment, "worker"),
    redisUrl: parsePrivateServiceUrl(rawEnvironment, "worker", "REDIS_URL"),
    tokenEncryption: parseEncryptionKeyRing(rawEnvironment, "worker"),
  });
}
