import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { SecretValue, type EncryptionKeyRing } from "@aramayo/configuration";

import { TokenCipher } from "./token-cipher.ts";

function keyRing(): EncryptionKeyRing {
  return Object.freeze({
    activeVersion: "v2",
    keys: Object.freeze([
      Object.freeze({
        material: new SecretValue(randomBytes(32).toString("base64")),
        version: "v2",
      }),
      Object.freeze({
        material: new SecretValue(randomBytes(32).toString("base64")),
        version: "v1",
      }),
    ]),
  });
}

test("AES-256-GCM cifra con IV único y sólo devuelve el texto al backend", () => {
  const cipher = new TokenCipher(keyRing());
  const first = cipher.encrypt("EAAB-meta-token");
  const second = cipher.encrypt("EAAB-meta-token");

  assert.notEqual(first.ciphertext, "EAAB-meta-token");
  assert.notEqual(first.initializationVector, second.initializationVector);
  assert.equal(cipher.decrypt(first), "EAAB-meta-token");
  assert.equal(cipher.decrypt(second), "EAAB-meta-token");
});

test("un tag alterado falla cerrado", () => {
  const cipher = new TokenCipher(keyRing());
  const encrypted = cipher.encrypt("EAAB-meta-token");
  assert.throws(() =>
    cipher.decrypt({
      ...encrypted,
      authenticationTag: "AAAAAAAAAAAAAAAAAAAAAA",
    }),
  );
});
