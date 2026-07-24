import { ConfigurationError } from "./configuration-error.ts";
import type {
  ApplicationEnvironment,
  OptionalIntegration,
  RawEnvironment,
  SecretValue,
} from "./types.ts";
import {
  assertPattern,
  failConfiguration,
  isIntegrationConfigured,
  parseHttpUrl,
  parseSecret,
  readOptional,
} from "./validation.ts";

export interface MetaCredentials {
  readonly appId: string;
  readonly appSecret: SecretValue;
  readonly graphApiVersion: string;
  readonly redirectUri: string;
}

export interface OpenAICredentials {
  readonly apiKey: SecretValue;
  readonly projectId: string;
  readonly vectorStoreId?: string;
}

export interface CloudinaryCredentials {
  readonly apiKey: SecretValue;
  readonly apiSecret: SecretValue;
  readonly cloudName: string;
  readonly folder: string;
}

const metaVariables = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_REDIRECT_URI",
  "META_GRAPH_API_VERSION",
] as const;

const openAiVariables = ["OPENAI_API_KEY", "OPENAI_PROJECT_ID"] as const;

const cloudinaryVariables = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_FOLDER",
] as const;

export function parseMetaIntegration(
  rawEnvironment: RawEnvironment,
  processName: string,
  environment: ApplicationEnvironment,
): OptionalIntegration<MetaCredentials> {
  if (!isIntegrationConfigured(rawEnvironment, processName, metaVariables)) {
    return Object.freeze({ enabled: false });
  }

  return Object.freeze({
    credentials: Object.freeze({
      appId: assertPattern(
        rawEnvironment,
        processName,
        "META_APP_ID",
        /^\d+$/u,
      ),
      appSecret: parseSecret(
        rawEnvironment,
        processName,
        "META_APP_SECRET",
      ),
      graphApiVersion: assertPattern(
        rawEnvironment,
        processName,
        "META_GRAPH_API_VERSION",
        /^v\d+\.\d+$/u,
      ),
      redirectUri: parseHttpUrl(
        rawEnvironment,
        processName,
        "META_REDIRECT_URI",
        environment,
      ),
    }),
    enabled: true,
  });
}

export function parseOpenAiIntegration(
  rawEnvironment: RawEnvironment,
  processName: string,
): OptionalIntegration<OpenAICredentials> {
  const vectorStoreId = readOptional(
    rawEnvironment,
    "OPENAI_VECTOR_STORE_ID",
  );
  const coreIntegrationConfigured = isIntegrationConfigured(
    rawEnvironment,
    processName,
    openAiVariables,
  );

  if (!coreIntegrationConfigured && vectorStoreId !== undefined) {
    throw new ConfigurationError(
      processName,
      openAiVariables.map((variable) => ({
        code: "partial-group",
        variable,
      })),
    );
  }

  if (!coreIntegrationConfigured) {
    return Object.freeze({ enabled: false });
  }

  if (
    vectorStoreId !== undefined &&
    !/^vs_[A-Za-z0-9_-]+$/u.test(vectorStoreId)
  ) {
    failConfiguration(processName, "OPENAI_VECTOR_STORE_ID", "invalid");
  }

  const baseCredentials = {
    apiKey: parseSecret(
      rawEnvironment,
      processName,
      "OPENAI_API_KEY",
    ),
    projectId: assertPattern(
      rawEnvironment,
      processName,
      "OPENAI_PROJECT_ID",
      /^proj_[A-Za-z0-9_-]+$/u,
    ),
  };

  return Object.freeze({
    credentials: Object.freeze(
      vectorStoreId === undefined
        ? baseCredentials
        : { ...baseCredentials, vectorStoreId },
    ),
    enabled: true,
  });
}

export function parseCloudinaryIntegration(
  rawEnvironment: RawEnvironment,
  processName: string,
): OptionalIntegration<CloudinaryCredentials> {
  if (
    !isIntegrationConfigured(rawEnvironment, processName, cloudinaryVariables)
  ) {
    return Object.freeze({ enabled: false });
  }

  return Object.freeze({
    credentials: Object.freeze({
      apiKey: parseSecret(
        rawEnvironment,
        processName,
        "CLOUDINARY_API_KEY",
        6,
      ),
      apiSecret: parseSecret(
        rawEnvironment,
        processName,
        "CLOUDINARY_API_SECRET",
      ),
      cloudName: assertPattern(
        rawEnvironment,
        processName,
        "CLOUDINARY_CLOUD_NAME",
        /^[A-Za-z0-9_-]+$/u,
      ),
      folder: assertPattern(
        rawEnvironment,
        processName,
        "CLOUDINARY_FOLDER",
        /^[A-Za-z0-9][A-Za-z0-9/_-]*$/u,
      ),
    }),
    enabled: true,
  });
}
