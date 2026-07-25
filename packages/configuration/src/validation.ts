import {
  ConfigurationError,
  type ConfigurationIssue,
} from "./configuration-error.ts";
import {
  SecretValue,
  type ApplicationEnvironment,
  type CommonConfiguration,
  type EncryptionKey,
  type EncryptionKeyRing,
  type RawEnvironment,
} from "./types.ts";

export function failConfiguration(
  processName: string,
  variable: string,
  code: ConfigurationIssue["code"],
): never {
  throw new ConfigurationError(processName, [{ code, variable }]);
}

export function readRequired(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
): string {
  const rawValue = rawEnvironment[variable];
  if (rawValue === undefined) {
    failConfiguration(processName, variable, "missing");
  }

  const normalizedValue = rawValue.trim();
  if (normalizedValue.length === 0) {
    failConfiguration(processName, variable, "empty");
  }

  return normalizedValue;
}

export function readOptional(
  rawEnvironment: RawEnvironment,
  variable: string,
): string | undefined {
  const rawValue = rawEnvironment[variable];
  if (rawValue === undefined) {
    return undefined;
  }

  const normalizedValue = rawValue.trim();
  return normalizedValue.length === 0 ? undefined : normalizedValue;
}

export function isIntegrationConfigured(
  rawEnvironment: RawEnvironment,
  processName: string,
  variables: readonly string[],
): boolean {
  const configuredVariables = variables.filter(
    (variable) => readOptional(rawEnvironment, variable) !== undefined,
  );

  if (configuredVariables.length === 0) {
    return false;
  }

  const incompleteIssues: ConfigurationIssue[] = variables
    .filter((variable) => readOptional(rawEnvironment, variable) === undefined)
    .map((variable) => ({
      code: "partial-group",
      variable,
    }));

  if (incompleteIssues.length > 0) {
    throw new ConfigurationError(processName, incompleteIssues);
  }

  return true;
}

export function parseCommonConfiguration(
  rawEnvironment: RawEnvironment,
  processName: string,
): CommonConfiguration {
  const environmentValue = readRequired(
    rawEnvironment,
    processName,
    "NODE_ENV",
  );
  let environment: ApplicationEnvironment;
  switch (environmentValue) {
    case "development":
    case "production":
    case "staging":
    case "test":
      environment = environmentValue;
      break;
    default:
      failConfiguration(processName, "NODE_ENV", "invalid");
  }

  const timeZone = readRequired(rawEnvironment, processName, "APP_TIMEZONE");
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone }).format();
  } catch {
    failConfiguration(processName, "APP_TIMEZONE", "invalid");
  }

  return Object.freeze({ environment, timeZone });
}

export function parseInteger(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
  bounds: { readonly maximum: number; readonly minimum: number },
): number {
  const rawValue = readRequired(rawEnvironment, processName, variable);
  if (!/^\d+$/u.test(rawValue)) {
    failConfiguration(processName, variable, "invalid");
  }

  const parsedValue = Number(rawValue);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < bounds.minimum ||
    parsedValue > bounds.maximum
  ) {
    failConfiguration(processName, variable, "invalid");
  }

  return parsedValue;
}

export function parseHttpUrl(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
  environment: ApplicationEnvironment,
  requireOriginOnly = false,
): string {
  const rawValue = readRequired(rawEnvironment, processName, variable);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawValue);
  } catch {
    failConfiguration(processName, variable, "invalid");
  }

  if (
    (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
    ((environment === "production" || environment === "staging") &&
      parsedUrl.protocol !== "https:") ||
    (requireOriginOnly &&
      (parsedUrl.pathname !== "/" ||
        parsedUrl.search.length > 0 ||
        parsedUrl.hash.length > 0))
  ) {
    failConfiguration(processName, variable, "invalid");
  }

  return requireOriginOnly ? parsedUrl.origin : parsedUrl.toString();
}

export function parsePrivateServiceUrl(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: "DATABASE_URL" | "REDIS_URL",
): SecretValue {
  const rawValue = readRequired(rawEnvironment, processName, variable);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawValue);
  } catch {
    failConfiguration(processName, variable, "invalid");
  }

  const acceptedProtocols =
    variable === "DATABASE_URL"
      ? new Set(["postgres:", "postgresql:"])
      : new Set(["redis:", "rediss:"]);

  if (
    !acceptedProtocols.has(parsedUrl.protocol) ||
    parsedUrl.hostname.length === 0 ||
    parsedUrl.username.length === 0 ||
    parsedUrl.password.length === 0
  ) {
    failConfiguration(processName, variable, "invalid");
  }

  if (
    variable === "DATABASE_URL" &&
    (parsedUrl.pathname === "/" || parsedUrl.pathname.length === 0)
  ) {
    failConfiguration(processName, variable, "invalid");
  }

  return new SecretValue(rawValue);
}

export function parseSecret(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
  minimumLength = 16,
): SecretValue {
  const rawValue = readRequired(rawEnvironment, processName, variable);
  if (rawValue.length < minimumLength) {
    failConfiguration(processName, variable, "invalid");
  }
  return new SecretValue(rawValue);
}

export function parseEncryptionKeyRing(
  rawEnvironment: RawEnvironment,
  processName: string,
): EncryptionKeyRing {
  const variable = "TOKEN_ENCRYPTION_KEYS";
  const rawKeyRing = readRequired(rawEnvironment, processName, variable);
  const keyEntries = rawKeyRing.split(",");
  const versions = new Set<string>();
  const keys: EncryptionKey[] = [];

  for (const keyEntry of keyEntries) {
    const separatorIndex = keyEntry.indexOf(":");
    const version = keyEntry.slice(0, separatorIndex);
    const material = keyEntry.slice(separatorIndex + 1);

    if (
      separatorIndex <= 0 ||
      !/^[a-z0-9][a-z0-9._-]{0,31}$/u.test(version) ||
      !/^[A-Za-z0-9+/]{43}=$/u.test(material) ||
      versions.has(version)
    ) {
      failConfiguration(processName, variable, "invalid");
    }

    versions.add(version);
    keys.push(
      Object.freeze({
        material: new SecretValue(material),
        version,
      }),
    );
  }

  const activeKey = keys[0];
  if (!activeKey) {
    failConfiguration(processName, variable, "invalid");
  }

  return Object.freeze({
    activeVersion: activeKey.version,
    keys: Object.freeze(keys),
  });
}

export function assertPattern(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
  pattern: RegExp,
): string {
  const rawValue = readRequired(rawEnvironment, processName, variable);
  if (!pattern.test(rawValue)) {
    failConfiguration(processName, variable, "invalid");
  }
  return rawValue;
}
