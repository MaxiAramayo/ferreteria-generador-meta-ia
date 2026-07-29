import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ReliableOperationValidationError,
  validateAuditMetadata,
  validateOutboxTopic,
  validateReliableOperationName,
  validateSha256,
  type SafeJsonObject,
} from "./reliable-operations.ts";

test("acepta identificadores estables y hashes SHA-256", () => {
  assert.equal(
    validateReliableOperationName("content.publication-draft:create"),
    "content.publication-draft:create",
  );
  assert.equal(
    validateOutboxTopic("content.publication.created:v1"),
    "content.publication.created:v1",
  );
  assert.equal(validateSha256("a".repeat(64), "requestHash"), "a".repeat(64));
});

test("la auditoría rechaza campos sensibles a cualquier profundidad", () => {
  const metadata: SafeJsonObject = {
    publicationId: "publication-1",
    provider: {
      authorizationToken: "no-debe-persistirse",
    },
  };
  assert.throws(
    () => validateAuditMetadata(metadata),
    (cause: unknown) =>
      cause instanceof ReliableOperationValidationError &&
      cause.code === "sensitive-field" &&
      cause.field === "metadata.provider.authorizationToken",
  );
});

test("la auditoría limita profundidad, cantidad y tamaño", () => {
  const deep: SafeJsonObject = {
    one: { two: { three: { four: { five: { six: "fuera" } } } } },
  };
  assert.throws(
    () => validateAuditMetadata(deep),
    (cause: unknown) =>
      cause instanceof ReliableOperationValidationError &&
      cause.code === "payload-too-deep",
  );
  assert.throws(
    () => validateAuditMetadata({ text: "x".repeat(17_000) }),
    (cause: unknown) =>
      cause instanceof ReliableOperationValidationError &&
      cause.code === "payload-too-large",
  );
});

test("rechaza nombres ambiguos y hashes que no son hexadecimales", () => {
  assert.throws(
    () => validateReliableOperationName("Publicar ahora"),
    ReliableOperationValidationError,
  );
  assert.throws(
    () => validateSha256("not-a-hash", "requestHash"),
    ReliableOperationValidationError,
  );
});
