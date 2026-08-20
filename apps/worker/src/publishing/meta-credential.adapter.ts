/**
 * Credencial de publicación del worker.
 *
 * Lee el token cifrado del activo y lo descifra en memoria. Devuelve `null` en
 * vez de fallar cuando la conexión no lo guarda, porque «esta conexión no puede
 * publicar» es una respuesta legítima que quien orquesta tiene que poder
 * distinguir de un error de infraestructura.
 *
 * Publica el token de la Page incluso para Instagram: la cuenta profesional no
 * guarda uno propio.
 */

import type { MetaConnectionRepository } from "@aramayo/domain";

import type { PublicationCredentialPort } from "./publication-order.transport.ts";
import type { TokenDecipher } from "./token-decipher.ts";

export class MetaPageCredentialAdapter implements PublicationCredentialPort {
  readonly #connections: MetaConnectionRepository;
  readonly #decipher: TokenDecipher;

  constructor(connections: MetaConnectionRepository, decipher: TokenDecipher) {
    this.#connections = connections;
    this.#decipher = decipher;
  }

  async pageAccessToken(
    organizationId: string,
    metaConnectionId: string,
  ): Promise<string | null> {
    const secret = await this.#connections.findAssetSecret(
      organizationId,
      metaConnectionId,
      "page",
    );
    return secret === null ? null : this.#decipher.decrypt(secret.accessSecret);
  }
}
