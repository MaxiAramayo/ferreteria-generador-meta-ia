import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseApiEnvironment } from "./api.ts";
import { ConfigurationError } from "./configuration-error.ts";
import { parseWebPublicEnvironment } from "./web.ts";
import { parseWorkerEnvironment } from "./worker.ts";

const placeholderEncryptionKey =
  "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const commonEnvironment = Object.freeze({
  APP_TIMEZONE: "America/Argentina/Cordoba",
  NODE_ENV: "test",
});

const privateServiceEnvironment = Object.freeze({
  ...commonEnvironment,
  AUTH_SESSION_TTL_SECONDS: "43200",
  DATABASE_URL:
    "postgresql://aramayo:local-placeholder@127.0.0.1:5432/aramayo_content",
  REDIS_URL: "redis://aramayo:local-placeholder@127.0.0.1:6379",
  TOKEN_ENCRYPTION_KEYS: placeholderEncryptionKey,
});

test("builds separate immutable configurations for every process", () => {
  const webConfiguration = parseWebPublicEnvironment({
    ...commonEnvironment,
    NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001",
    OPENAI_API_KEY: "private-placeholder-never-exported",
  });
  const apiConfiguration = parseApiEnvironment({
    ...privateServiceEnvironment,
    PORT: "3001",
    TRUST_PROXY_HOPS: "0",
    WEB_ORIGIN: "http://localhost:3000",
  });
  const workerConfiguration = parseWorkerEnvironment({
    ...privateServiceEnvironment,
    WORKER_CONCURRENCY: "4",
  });

  assert.equal(webConfiguration.apiBaseUrl, "http://localhost:3001/");
  assert.equal(Object.hasOwn(webConfiguration, "OPENAI_API_KEY"), false);
  assert.equal(apiConfiguration.port, 3_001);
  assert.equal(apiConfiguration.authenticationSessionTtlSeconds, 43_200);
  assert.equal(apiConfiguration.meta.enabled, false);
  assert.equal(apiConfiguration.trustProxyHops, 0);
  assert.equal(workerConfiguration.concurrency, 4);
  assert.equal(workerConfiguration.chromiumExecutablePath, undefined);
  assert.equal(workerConfiguration.openAi.enabled, false);
  assert.equal(Object.isFrozen(workerConfiguration), true);
  assert.equal(
    JSON.stringify(workerConfiguration).includes("local-placeholder"),
    false,
  );
});

test("rejects a missing required variable by name", () => {
  assert.throws(
    () =>
      parseApiEnvironment({
        ...privateServiceEnvironment,
        PORT: "3001",
        TRUST_PROXY_HOPS: "0",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.message.includes("WEB_ORIGIN") &&
      cause.issues[0]?.code === "missing",
  );
});

test("rejects an invalid format without echoing its content", () => {
  const invalidDatabaseUrl = "not-a-private-database-url";

  assert.throws(
    () =>
      parseApiEnvironment({
        ...privateServiceEnvironment,
        DATABASE_URL: invalidDatabaseUrl,
        PORT: "3001",
        TRUST_PROXY_HOPS: "0",
        WEB_ORIGIN: "http://localhost:3000",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.message.includes("DATABASE_URL") &&
      !cause.message.includes(invalidDatabaseUrl),
  );
});

test("rejects an empty required secret", () => {
  assert.throws(
    () =>
      parseWorkerEnvironment({
        ...privateServiceEnvironment,
        TOKEN_ENCRYPTION_KEYS: "  ",
        WORKER_CONCURRENCY: "4",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.issues[0]?.variable === "TOKEN_ENCRYPTION_KEYS" &&
      cause.issues[0].code === "empty",
  );
});

test("accepts only an absolute optional Chromium executable path", () => {
  const workerConfiguration = parseWorkerEnvironment({
    ...privateServiceEnvironment,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:
      "/ms-playwright/chromium/chrome-linux/chrome",
    WORKER_CONCURRENCY: "1",
  });

  assert.equal(
    workerConfiguration.chromiumExecutablePath,
    "/ms-playwright/chromium/chrome-linux/chrome",
  );
  assert.throws(
    () =>
      parseWorkerEnvironment({
        ...privateServiceEnvironment,
        PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "chromium/chrome",
        WORKER_CONCURRENCY: "1",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.issues[0]?.variable === "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH" &&
      cause.issues[0].code === "invalid",
  );
});

test("rejects a partially configured provider integration", () => {
  assert.throws(
    () =>
      parseWorkerEnvironment({
        ...privateServiceEnvironment,
        OPENAI_API_KEY: "openai-placeholder-value",
        WORKER_CONCURRENCY: "4",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.message.includes("OPENAI_PROJECT_ID") &&
      !cause.message.includes("openai-placeholder-value"),
  );

  assert.throws(
    () =>
      parseWorkerEnvironment({
        ...privateServiceEnvironment,
        OPENAI_VECTOR_STORE_ID: "vs_placeholder",
        WORKER_CONCURRENCY: "4",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.message.includes("OPENAI_API_KEY") &&
      cause.message.includes("OPENAI_PROJECT_ID"),
  );
});

test("enables complete provider groups and redacts their secrets", () => {
  const workerConfiguration = parseWorkerEnvironment({
    ...privateServiceEnvironment,
    CLOUDINARY_API_KEY: "cloudinary-placeholder-key",
    CLOUDINARY_API_SECRET: "cloudinary-placeholder-secret",
    CLOUDINARY_CLOUD_NAME: "aramayo-test",
    CLOUDINARY_FOLDER: "aramayo/test",
    META_APP_ID: "1234567890",
    META_APP_SECRET: "meta-placeholder-secret",
    META_GRAPH_API_VERSION: "v24.0",
    META_REDIRECT_URI: "http://localhost:3001/oauth/meta/callback",
    OPENAI_API_KEY: "openai-placeholder-key",
    OPENAI_PROJECT_ID: "proj_placeholder",
    OPENAI_VECTOR_STORE_ID: "vs_placeholder",
    WORKER_CONCURRENCY: "4",
  });

  assert.equal(workerConfiguration.cloudinary.enabled, true);
  assert.equal(workerConfiguration.meta.enabled, true);
  assert.equal(workerConfiguration.openAi.enabled, true);
  assert.deepEqual(workerConfiguration.openAi.policy, {
    maximumInputCharacters: 50_000,
    maximumOutputTokens: 4_096,
    maximumRetries: 2,
    models: {
      brief: "gpt-5.6-terra",
      complex: "gpt-5.6-sol",
      routine: "gpt-5.6-luna",
    },
    requestTimeoutMilliseconds: 60_000,
    retryBaseDelayMilliseconds: 500,
  });

  const serializedConfiguration = JSON.stringify(workerConfiguration);
  assert.equal(serializedConfiguration.includes("placeholder-secret"), false);
  assert.equal(serializedConfiguration.includes("placeholder-key"), false);
});

test("validates OpenAI model, timeout and execution limits", () => {
  assert.throws(
    () =>
      parseWorkerEnvironment({
        ...privateServiceEnvironment,
        OPENAI_API_KEY: "openai-placeholder-key",
        OPENAI_MAX_RETRIES: "5",
        OPENAI_MODEL_BRIEF: "invalid model",
        OPENAI_PROJECT_ID: "proj_placeholder",
        OPENAI_REQUEST_TIMEOUT_MS: "999",
        WORKER_CONCURRENCY: "4",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.issues.some((issue) => issue.variable === "OPENAI_MAX_RETRIES"),
  );

  const workerConfiguration = parseWorkerEnvironment({
    ...privateServiceEnvironment,
    OPENAI_API_KEY: "openai-placeholder-key",
    OPENAI_MAX_INPUT_CHARACTERS: "120000",
    OPENAI_MAX_OUTPUT_TOKENS: "8192",
    OPENAI_MAX_RETRIES: "1",
    OPENAI_MODEL_BRIEF: "gpt-5.6-terra-snapshot",
    OPENAI_MODEL_COMPLEX: "gpt-5.6-sol-snapshot",
    OPENAI_MODEL_ROUTINE: "gpt-5.6-luna-snapshot",
    OPENAI_PROJECT_ID: "proj_placeholder",
    OPENAI_REQUEST_TIMEOUT_MS: "45000",
    OPENAI_RETRY_BASE_DELAY_MS: "750",
    WORKER_CONCURRENCY: "4",
  });

  assert.equal(workerConfiguration.openAi.enabled, true);
  assert.equal(
    workerConfiguration.openAi.policy.maximumInputCharacters,
    120_000,
  );
  assert.equal(workerConfiguration.openAi.policy.maximumOutputTokens, 8_192);
  assert.equal(workerConfiguration.openAi.policy.maximumRetries, 1);
  assert.equal(
    workerConfiguration.openAi.policy.models.brief,
    "gpt-5.6-terra-snapshot",
  );
  assert.equal(
    workerConfiguration.openAi.policy.requestTimeoutMilliseconds,
    45_000,
  );
  assert.equal(
    workerConfiguration.openAi.policy.retryBaseDelayMilliseconds,
    750,
  );
});

test("rejects undeclared browser variables", () => {
  assert.throws(
    () =>
      parseWebPublicEnvironment({
        ...commonEnvironment,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001",
        NEXT_PUBLIC_OPENAI_API_KEY: "must-never-reach-the-browser",
      }),
    (cause: unknown) =>
      cause instanceof ConfigurationError &&
      cause.issues[0]?.code === "forbidden-public-variable" &&
      !cause.message.includes("must-never-reach-the-browser"),
  );
});

test(".env.example documents the complete contract without secret values", async () => {
  const environmentExamplePath = new URL(
    "../../../.env.example",
    import.meta.url,
  );
  const environmentExample = await readFile(environmentExamplePath, "utf8");
  const entries = new Map(
    environmentExample
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [
          line.slice(0, separatorIndex),
          line.slice(separatorIndex + 1),
        ] as const;
      }),
  );

  const expectedVariables = [
    "APP_TIMEZONE",
    "AUTH_SESSION_TTL_SECONDS",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_FOLDER",
    "DATABASE_URL",
    "META_APP_ID",
    "META_APP_SECRET",
    "META_GRAPH_API_VERSION",
    "META_REDIRECT_URI",
    "NEXT_PUBLIC_API_BASE_URL",
    "NODE_ENV",
    "OPENAI_API_KEY",
    "OPENAI_MAX_INPUT_CHARACTERS",
    "OPENAI_MAX_OUTPUT_TOKENS",
    "OPENAI_MAX_RETRIES",
    "OPENAI_MODEL_BRIEF",
    "OPENAI_MODEL_COMPLEX",
    "OPENAI_MODEL_ROUTINE",
    "OPENAI_PROJECT_ID",
    "OPENAI_REQUEST_TIMEOUT_MS",
    "OPENAI_RETRY_BASE_DELAY_MS",
    "OPENAI_VECTOR_STORE_ID",
    "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
    "PORT",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "REDIS_PASSWORD",
    "REDIS_PORT",
    "REDIS_URL",
    "TOKEN_ENCRYPTION_KEYS",
    "TRUST_PROXY_HOPS",
    "WEB_ORIGIN",
    "WORKER_CONCURRENCY",
  ];

  assert.deepEqual([...entries.keys()].sort(), expectedVariables);

  const secretVariables = [
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "DATABASE_URL",
    "META_APP_SECRET",
    "OPENAI_API_KEY",
    "POSTGRES_PASSWORD",
    "REDIS_PASSWORD",
    "REDIS_URL",
    "TOKEN_ENCRYPTION_KEYS",
  ];
  for (const secretVariable of secretVariables) {
    assert.equal(entries.get(secretVariable), "");
  }
});
