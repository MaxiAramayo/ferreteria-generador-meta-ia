import { parseMetaIntegration, type MetaCredentials } from "./providers.ts";
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
  readonly authenticationSessionTtlSeconds: number;
  readonly databaseUrl: SecretValue;
  readonly meta: OptionalIntegration<MetaCredentials>;
  readonly port: number;
  readonly redisUrl: SecretValue;
  readonly tokenEncryption: EncryptionKeyRing;
  readonly trustProxyHops: number;
  readonly webOrigin: string;
}

export function parseApiEnvironment(
  rawEnvironment: RawEnvironment,
): ApiConfiguration {
  const commonConfiguration = parseCommonConfiguration(rawEnvironment, "api");

  return Object.freeze({
    ...commonConfiguration,
    authenticationSessionTtlSeconds: parseInteger(
      rawEnvironment,
      "api",
      "AUTH_SESSION_TTL_SECONDS",
      {
        maximum: 2_592_000,
        minimum: 900,
      },
    ),
    databaseUrl: parsePrivateServiceUrl(rawEnvironment, "api", "DATABASE_URL"),
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
    trustProxyHops: parseInteger(rawEnvironment, "api", "TRUST_PROXY_HOPS", {
      maximum: 4,
      minimum: 0,
    }),
    webOrigin: parseHttpUrl(
      rawEnvironment,
      "api",
      "WEB_ORIGIN",
      commonConfiguration.environment,
      true,
    ),
  });
}
