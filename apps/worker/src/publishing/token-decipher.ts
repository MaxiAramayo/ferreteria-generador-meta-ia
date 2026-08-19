/**
 * Descifrado de credenciales Meta en el worker.
 *
 * Solo descifra. El worker publica y para eso necesita leer el token de la
 * Page; cifrar es de quien administra la conexión, que es la API. Un descifrador
 * que no sabe cifrar no puede, por error, guardar un token con la llave
 * equivocada ni volver a escribir uno que ya estaba guardado.
 *
 * Comparte formato con `apps/api/src/connections/token-cipher.ts` —AES-256-GCM,
 * IV y tag propios, versión de llave explícita— porque lee exactamente lo que
 * aquel escribió. Unificar las dos mitades en un módulo común corresponde a
 * `P5-T05`, cuando el worker publique dentro de su propio caso de uso; hacerlo
 * ahora obligaría a decidir dónde vive el módulo compartido, que es un cambio de
 * los límites declarados en `AGENTS.md`.
 */

import { createDecipheriv } from "node:crypto";

import type { EncryptionKeyRing } from "@aramayo/configuration";
import type { EncryptedSecret } from "@aramayo/domain";

export class TokenDecipher {
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
}
