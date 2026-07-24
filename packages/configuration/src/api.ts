import {
  parseMetaIntegration,
  type MetaCredentials,
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
  parseHttpUrl,
  parseInteger,
  parsePrivateServiceUrl,
} from "./validation.ts";

export interface ApiConfiguration extends CommonConfiguration {
  readonly databaseUrl: SecretValue;
  readonly meta: OptionalIntegration<MetaCredentials>;
  readonly port: number;
  readonly redisUrl: SecretValue;
  readonly tokenEncryption: EncryptionKeyRing;
  readonly webOrigin: string;
}

export function parseApiEnvironment(
  rawEnvironment: RawEnvironment,
): ApiConfiguration {
  const commonConfiguration = parseCommonConfiguration(rawEnvironment, "api");

  return Object.freeze({
    ...commonConfiguration,
    databaseUrl: parsePrivateServiceUrl(
      rawEnvironment,
      "api",
      "DATABASE_URL",
    ),
    meta: parseMetaIntegration(
      rawEnvironment,
      "api",
      commonConfiguration.environment,
    ),
    port: parseInteger(rawEnvironment, "api", "PORT", {
      maximum: 65_535,
      minimum: 1,
    }),
    redisUrl: parsePrivateServiceUrl(rawEnvironment, "api", "REDIS_URL"),
    tokenEncryption: parseEncryptionKeyRing(rawEnvironment, "api"),
    webOrigin: parseHttpUrl(
      rawEnvironment,
      "api",
      "WEB_ORIGIN",
      commonConfiguration.environment,
      true,
    ),
  });
}
