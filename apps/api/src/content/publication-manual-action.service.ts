/**
 * Acciones manuales sobre destinos detenidos.
 *
 * Es la mitad visible del criterio «agotar intentos genera alerta y acción
 * manual clara». La alerta no se emite a ningún lado: se expone como lista
 * consultable, que es lo que el resto de la plataforma ya hace con el
 * presupuesto de generación. Un destino detenido que nadie mira es un fallo
 * silencioso, y una notificación que nadie recibe también.
 *
 * Lo que hace segura la parte de «acción» es que el servidor decide qué se
 * puede hacer. El panel muestra `actions` tal como llegan y no las deduce: si
 * dedujera, la regla viviría en dos lugares y bastaría una lista vieja en
 * pantalla para ofrecer un reintento sobre un destino cuyo desenlace nadie
 * conoce. El repositorio vuelve a comprobar el permiso contra el motivo
 * guardado, así que apretar ese botón viejo tampoco alcanza.
 */

import type {
  PublicationManualActionListResponse,
  PublicationManualActionResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  type AuthenticatedActor,
  type PublicationManualAction,
  type PublicationManualActionRecord,
  type PublicationRetryRepository,
} from "@aramayo/domain";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { PUBLICATION_ORDER_REPOSITORY } from "../database/database.tokens.ts";

/** Cota de la lista. La alerta es para mirar, no para paginar una bandeja. */
const manualActionLimit = 100;

function manualActionResponse(
  record: PublicationManualActionRecord,
): PublicationManualActionResponse {
  return Object.freeze({
    actions: Object.freeze([...record.actions]),
    attempts: record.attempts,
    ...(record.failureCode === undefined
      ? {}
      : { failureCode: record.failureCode }),
    ...(record.failureDetail === undefined
      ? {}
      : { failureDetail: record.failureDetail }),
    orderId: record.orderId,
    publicationId: record.publicationId,
    publicationTargetId: record.publicationTargetId,
    // El motivo `abandoned-by-operator` nunca llega acá: el repositorio sólo
    // devuelve los que todavía esperan a alguien.
    reason: record.reason as PublicationManualActionResponse["reason"],
    state: record.state,
    target: record.target,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PublicationManualActionService {
  readonly #repository: PublicationRetryRepository;

  constructor(
    @Inject(PUBLICATION_ORDER_REPOSITORY)
    repository: PublicationRetryRepository,
  ) {
    this.#repository = repository;
  }

  async list(
    actor: AuthenticatedActor,
  ): Promise<PublicationManualActionListResponse> {
    this.#require(actor);
    const records = await this.#repository.pendingManualActions(
      actor.organizationId,
      manualActionLimit,
    );
    return Object.freeze({
      items: Object.freeze(records.map(manualActionResponse)),
    });
  }

  async apply(
    actor: AuthenticatedActor,
    publicationTargetId: string,
    action: PublicationManualAction,
  ): Promise<PublicationManualActionListResponse> {
    this.#require(actor);
    const result = await this.#repository.applyManualAction({
      action,
      actorMembershipId: actor.membershipId,
      occurredAt: new Date().toISOString(),
      organizationId: actor.organizationId,
      publicationTargetId,
    });

    switch (result.status) {
      case "applied":
        break;
      case "conflict":
        throw new ConflictException(
          "El destino cambió mientras decidías. Recargá para ver su estado.",
        );
      case "not-allowed":
        // 422 y no 403: el permiso está, lo que no corresponde es la acción
        // sobre este destino en este momento.
        throw new UnprocessableEntityException(
          "Esa acción no es segura para el motivo por el que el destino se detuvo.",
        );
      case "not-found":
        throw new NotFoundException("El destino no existe.");
    }
    return this.list(actor);
  }

  /**
   * Actuar sobre una publicación detenida es decidir sobre una acción externa,
   * así que exige el mismo permiso que publicar.
   */
  #require(actor: AuthenticatedActor): void {
    if (
      !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "Falta el permiso para operar publicaciones.",
      );
    }
  }
}
