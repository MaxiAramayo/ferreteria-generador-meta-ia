import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { EncryptionKeyRing } from "@aramayo/configuration";
import type { EncryptedSecret } from "@aramayo/domain";
import { Injectable } from "@nestjs/common";

@Injectable()
export class TokenCipher {
  readonly #activeVersion: string;
  readonly #keys: ReadonlyMap<string, Buffer>;

  constructor(keyRing: EncryptionKeyRing) {
    const keys = new Map<string, Buffer>();
    for (const key of keyRing.keys) {
      const material = Buffer.from(key.material.reveal(), "base64");
      if (material.byteLength !== 32) {
        throw new Error("La llave de cifrado no tiene 32 bytes.");
      }
      keys.set(key.version, material);
    }
    if (!keys.has(keyRing.activeVersion)) {
      throw new Error("La versión activa de cifrado no existe.");
    }
    this.#activeVersion = keyRing.activeVersion;
    this.#keys = keys;
  }

  decrypt(secret: EncryptedSecret): string {
    const key = this.#keys.get(secret.keyVersion);
    if (key === undefined) {
      throw new Error("La versión de cifrado del token no está disponible.");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(secret.initializationVector, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(secret.authenticationTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  encrypt(plainText: string): EncryptedSecret {
    if (plainText.length < 1) {
      throw new RangeError("No se puede cifrar un token vacío.");
    }
    const key = this.#keys.get(this.#activeVersion);
    if (key === undefined) {
      throw new Error("La versión activa de cifrado no existe.");
    }
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);
    return Object.freeze({
      authenticationTag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      initializationVector: initializationVector.toString("base64url"),
      keyVersion: this.#activeVersion,
    });
  }
}
