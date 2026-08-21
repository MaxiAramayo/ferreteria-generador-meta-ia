import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createMetaDeletionConfirmation,
  MetaSignedRequestError,
  parseMetaDeletionConfirmation,
  parseMetaSignedRequest,
} from "./meta-signed-request.ts";

const appSecret = "test-meta-app-secret";

function signedRequest(payload: Readonly<Record<string, unknown>>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest("base64url");
  return `${signature}.${encodedPayload}`;
}

test("verifica HMAC-SHA256 y devuelve solamente el identificador de cuenta", () => {
  const parsed = parseMetaSignedRequest(
    signedRequest({
      algorithm: "HMAC-SHA256",
      issued_at: 1_787_313_600,
      user_id: "meta-account-1",
    }),
    appSecret,
  );
  assert.deepEqual(parsed, {
    algorithm: "HMAC-SHA256",
    userId: "meta-account-1",
  });
});

test("rechaza firma alterada, algoritmo distinto y payload incompleto", () => {
  const valid = signedRequest({
    algorithm: "HMAC-SHA256",
    user_id: "meta-account-1",
  });
  assert.throws(
    () => parseMetaSignedRequest(`A${valid.slice(1)}`, appSecret),
    MetaSignedRequestError,
  );
  assert.throws(
    () =>
      parseMetaSignedRequest(
        signedRequest({ algorithm: "HMAC-SHA1", user_id: "account" }),
        appSecret,
      ),
    MetaSignedRequestError,
  );
  assert.throws(
    () =>
      parseMetaSignedRequest(
        signedRequest({ algorithm: "HMAC-SHA256" }),
        appSecret,
      ),
    MetaSignedRequestError,
  );
});

test("el código opaco de eliminación conserva un estado verificable", () => {
  const completedAt = "2026-08-21T19:00:00.000Z";
  const confirmationCode = createMetaDeletionConfirmation(
    completedAt,
    appSecret,
  );
  assert.deepEqual(parseMetaDeletionConfirmation(confirmationCode, appSecret), {
    completedAt,
  });
  assert.throws(
    () => parseMetaDeletionConfirmation(confirmationCode, "otro-secreto"),
    MetaSignedRequestError,
  );
});
