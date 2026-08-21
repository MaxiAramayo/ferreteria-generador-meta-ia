/**
 * Si la organización puede publicar, para quien publica.
 *
 * Nació de un defecto que sólo se ve corriendo la vertical entera: el panel
 * decidía si ofrecer el botón leyendo el listado de conexiones, y ese listado
 * exige `connections:manage`, que el rol `publisher` no tiene. La consecuencia
 * era silenciosa y completa —quien está autorizado a publicar nunca veía el
 * control— y ninguna prueba con la API simulada podía encontrarla.
 *
 * La respuesta es deliberadamente pobre: si se puede publicar, contra qué
 * cuenta y a qué destinos. Nada de salud, permisos otorgados ni identificadores
 * de activos. Administrar conexiones sigue siendo de otro rol; lo único que se
 * comparte es lo que hace falta para decidir sobre una pieza.
 */

import type { PublishingReadinessResponse } from "@aramayo/contracts";
import {
  authorizeActor,
  metaConnectionCanPublish,
  type AuthenticatedActor,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type PublicationTarget,
} from "@aramayo/domain";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { META_CONNECTION_REPOSITORY } from "../database/database.tokens.ts";

/**
 * Destinos que la conexión puede atender.
 *
 * Se derivan de los activos activos y no de una lista fija: ofrecer Instagram
 * cuando la conexión sólo tiene una Page haría que el problema apareciera
 * después de confirmar una acción irreversible.
 */
function availableTargets(
  connection: MetaConnectionRecord,
): readonly PublicationTarget[] {
  const active = new Set(
    connection.assets
      .filter((asset) => asset.status === "active")
      .map((asset) => asset.kind),
  );
  const targets: PublicationTarget[] = [];
  if (active.has("instagram_business")) {
    targets.push("instagram_feed", "instagram_story");
  }
  if (active.has("page")) {
    targets.push("facebook_page");
  }
  return Object.freeze(targets);
}

@Injectable()
export class PublishingReadinessService {
  readonly #connections: MetaConnectionRepository;

  constructor(
    @Inject(META_CONNECTION_REPOSITORY)
    connections: MetaConnectionRepository,
  ) {
    this.#connections = connections;
  }

  async read(actor: AuthenticatedActor): Promise<PublishingReadinessResponse> {
    if (
      !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "No tenés permisos para publicar en nombre de la organización.",
      );
    }

    const connections = await this.#connections.list(actor.organizationId);
    const connection = connections.find(metaConnectionCanPublish);
    if (connection === undefined) {
      return Object.freeze({ canPublish: false, targets: Object.freeze([]) });
    }
    const targets = availableTargets(connection);
    return Object.freeze({
      accountName: connection.accountName,
      // Una conexión sana sin activos publicables no habilita nada, y decir
      // que sí obligaría al panel a descubrirlo por su cuenta.
      canPublish: targets.length > 0,
      targets,
    });
  }
}
