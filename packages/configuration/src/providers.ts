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

export interface OpenAIModelPolicy {
  readonly brief: string;
  readonly complex: string;
  readonly routine: string;
}

export interface OpenAIRuntimePolicy {
  readonly maximumInputCharacters: number;
  readonly maximumOutputTokens: number;
  readonly maximumRetries: number;
  readonly models: OpenAIModelPolicy;
  readonly requestTimeoutMilliseconds: number;
  readonly retryBaseDelayMilliseconds: number;
}

export type OpenAIIntegration =
  | Readonly<{ enabled: false }>
  | Readonly<{
      credentials: OpenAICredentials;
      enabled: true;
      policy: OpenAIRuntimePolicy;
    }>;

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

const openAiPolicyDefaults = Object.freeze({
  maximumInputCharacters: 50_000,
  maximumOutputTokens: 4_096,
  maximumRetries: 2,
  models: Object.freeze({
    brief: "gpt-5.6-terra",
    complex: "gpt-5.6-sol",
    routine: "gpt-5.6-luna",
  }),
  requestTimeoutMilliseconds: 60_000,
  retryBaseDelayMilliseconds: 500,
});

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
      appSecret: parseSecret(rawEnvironment, processName, "META_APP_SECRET"),
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
): OpenAIIntegration {
  const vectorStoreId = readOptional(rawEnvironment, "OPENAI_VECTOR_STORE_ID");
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
    apiKey: parseSecret(rawEnvironment, processName, "OPENAI_API_KEY"),
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
    policy: Object.freeze({
      maximumInputCharacters: parseOpenAiInteger(
        rawEnvironment,
        processName,
        "OPENAI_MAX_INPUT_CHARACTERS",
        openAiPolicyDefaults.maximumInputCharacters,
        1_000,
        200_000,
      ),
      maximumOutputTokens: parseOpenAiInteger(
        rawEnvironment,
        processName,
        "OPENAI_MAX_OUTPUT_TOKENS",
        openAiPolicyDefaults.maximumOutputTokens,
        16,
        128_000,
      ),
      maximumRetries: parseOpenAiInteger(
        rawEnvironment,
        processName,
        "OPENAI_MAX_RETRIES",
        openAiPolicyDefaults.maximumRetries,
        0,
        4,
      ),
      models: Object.freeze({
        brief: parseOpenAiModel(
          rawEnvironment,
          processName,
          "OPENAI_MODEL_BRIEF",
          openAiPolicyDefaults.models.brief,
        ),
        complex: parseOpenAiModel(
          rawEnvironment,
          processName,
          "OPENAI_MODEL_COMPLEX",
          openAiPolicyDefaults.models.complex,
        ),
        routine: parseOpenAiModel(
          rawEnvironment,
          processName,
          "OPENAI_MODEL_ROUTINE",
          openAiPolicyDefaults.models.routine,
        ),
      }),
      requestTimeoutMilliseconds: parseOpenAiInteger(
        rawEnvironment,
        processName,
        "OPENAI_REQUEST_TIMEOUT_MS",
        openAiPolicyDefaults.requestTimeoutMilliseconds,
        1_000,
        300_000,
      ),
      retryBaseDelayMilliseconds: parseOpenAiInteger(
        rawEnvironment,
        processName,
        "OPENAI_RETRY_BASE_DELAY_MS",
        openAiPolicyDefaults.retryBaseDelayMilliseconds,
        100,
        10_000,
      ),
    }),
  });
}

function parseOpenAiInteger(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = readOptional(rawEnvironment, variable);
  if (rawValue === undefined) {
    return defaultValue;
  }
  if (!/^\d+$/u.test(rawValue)) {
    failConfiguration(processName, variable, "invalid");
  }
  const parsedValue = Number(rawValue);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < minimum ||
    parsedValue > maximum
  ) {
    failConfiguration(processName, variable, "invalid");
  }
  return parsedValue;
}

function parseOpenAiModel(
  rawEnvironment: RawEnvironment,
  processName: string,
  variable: string,
  defaultValue: string,
): string {
  const model = readOptional(rawEnvironment, variable) ?? defaultValue;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u.test(model)) {
    failConfiguration(processName, variable, "invalid");
  }
  return model;
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
      apiKey: parseSecret(rawEnvironment, processName, "CLOUDINARY_API_KEY", 6),
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
