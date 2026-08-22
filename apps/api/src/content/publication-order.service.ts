/**
 * Casos de uso de la orden de publicación.
 *
 * Pedir una publicación es la acción externa e irreversible del sistema, así
 * que exige el permiso `publishing:execute` —que sólo tiene el rol
 * `publisher`— y una clave idempotente. Sin la clave, un doble envío desde el
 * navegador crearía dos órdenes sobre la misma publicación.
 *
 * El estado agregado se calcula al leer y no se guarda: la respuesta describe lo
 * que los destinos dicen en ese momento, y no un campo que podría haber quedado
 * viejo.
 */

import type {
  PublicationOrderListResponse,
  PublicationOrderRequestResponse,
  PublicationOrderResponse,
  PublicationOrderTargetResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  publicationOrderStatus,
  type AuthenticatedActor,
  type PublicationOrderRecord,
  type PublicationOrderRepository,
  type PublicationTarget,
  type ReliableMutationContext,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import { PUBLICATION_ORDER_REPOSITORY } from "../database/database.tokens.ts";

function targetResponse(
  target: PublicationOrderRecord["targets"][number],
): PublicationOrderTargetResponse {
  return Object.freeze({
    ...(target.failureCode === undefined
      ? {}
      : { failureCode: target.failureCode }),
    ...(target.failureDetail === undefined
      ? {}
      : { failureDetail: target.failureDetail }),
    ...(target.failureRetryable === undefined
      ? {}
      : { failureRetryable: target.failureRetryable }),
    ...(target.remotePermalink === undefined
      ? {}
      : { permalink: target.remotePermalink }),
    ...(target.remotePostId === undefined
      ? {}
      : { remotePostId: target.remotePostId }),
    state: target.state,
    target: target.target,
    updatedAt: target.updatedAt,
  });
}

function orderResponse(
  order: PublicationOrderRecord,
): PublicationOrderResponse {
  return Object.freeze({
    ...(order.cancelledAt === undefined
      ? {}
      : { cancelledAt: order.cancelledAt }),
    createdAt: order.createdAt,
    id: order.id,
    publicationId: order.publicationId,
    status: publicationOrderStatus(order.targets),
    targets: Object.freeze(order.targets.map(targetResponse)),
    updatedAt: order.updatedAt,
  });
}

/** Cota del historial: es para mirar atrás, no para auditar en profundidad. */
const orderHistoryLimit = 20;

@Injectable()
export class PublicationOrderService {
  readonly #reliableOperations: ReliableOperationService;
  readonly #repository: PublicationOrderRepository;

  constructor(
    @Inject(PUBLICATION_ORDER_REPOSITORY)
    repository: PublicationOrderRepository,
    reliableOperations: ReliableOperationService,
  ) {
    this.#reliableOperations = reliableOperations;
    this.#repository = repository;
  }

  async request(
    actor: AuthenticatedActor,
    publicationId: string,
    expectedVersion: number,
    targets: readonly PublicationTarget[],
    idempotencyKey?: string,
  ): Promise<PublicationOrderRequestResponse> {
    this.#require(actor);
    const reliableOperation = this.#prepare(
      actor,
      "content.publication:request-publish",
      idempotencyKey,
      { expectedVersion, publicationId, targets: [...targets].sort() },
    );
    const result = await this.#repository.request({
      actorMembershipId: actor.membershipId,
      expectedVersion,
      organizationId: actor.organizationId,
      publicationId,
      reliableOperation,
      targets,
    });
    switch (result.status) {
      case "accepted":
        return Object.freeze({
          orderId: result.orderId,
          publicationId: result.publicationId,
          status: "publishing",
          version: result.version,
        });
      case "conflict":
        throw new ConflictException(
          "La publicación cambió. Recargá antes de publicar.",
        );
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra solicitud.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma solicitud de publicación todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-target":
        throw new BadRequestException(
          "Hay que indicar al menos un destino válido.",
        );
      case "target-policy-conflict":
        throw new BadRequestException(
          "Los destinos no coinciden con los que se aprobaron para esta pieza.",
        );
      case "not-approved":
        throw new ConflictException(
          "Sólo se puede publicar una pieza aprobada con snapshot.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la publicación.");
    }
  }

  /**
   * Historial de la publicación.
   *
   * Una pieza puede tener más de una orden, y el estado agregado de cada una se
   * vuelve a calcular al leer: mostrar el de la orden vieja tal como quedó
   * guardado sería mostrar un campo que nadie garantiza.
   */
  async list(
    actor: AuthenticatedActor,
    publicationId: string,
  ): Promise<PublicationOrderListResponse> {
    this.#require(actor);
    const orders = await this.#repository.listByPublication(
      actor.organizationId,
      publicationId,
      orderHistoryLimit,
    );
    return Object.freeze({
      items: Object.freeze(orders.map(orderResponse)),
    });
  }

  async find(
    actor: AuthenticatedActor,
    orderId: string,
  ): Promise<PublicationOrderResponse> {
    this.#require(actor);
    const order = await this.#repository.findById(
      actor.organizationId,
      orderId,
    );
    if (order === null) {
      throw new NotFoundException("No se encontró la orden de publicación.");
    }
    return orderResponse(order);
  }

  /**
   * Cancelar impide intentos nuevos y no toca lo que ya salió: una publicación
   * remota no se deshace desde acá.
   */
  async cancel(
    actor: AuthenticatedActor,
    orderId: string,
    reasonCode: string,
  ): Promise<PublicationOrderResponse> {
    this.#require(actor);
    const result = await this.#repository.cancel({
      actorMembershipId: actor.membershipId,
      cancelledAt: new Date().toISOString(),
      orderId,
      organizationId: actor.organizationId,
      reasonCode,
    });
    if (result.status === "not-found") {
      throw new NotFoundException("No se encontró la orden de publicación.");
    }
    return orderResponse(result.order);
  }

  #prepare(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string | undefined,
    request: unknown,
  ): ReliableMutationContext {
    if (idempotencyKey === undefined) {
      throw new BadRequestException(
        "El encabezado Idempotency-Key es obligatorio.",
      );
    }
    try {
      return this.#reliableOperations.prepare(
        actor,
        operation,
        idempotencyKey,
        request,
        new Date(),
      );
    } catch (cause: unknown) {
      if (cause instanceof RangeError || cause instanceof TypeError) {
        throw new BadRequestException(
          "El encabezado Idempotency-Key o la solicitud no son válidos.",
        );
      }
      throw cause;
    }
  }

  #require(actor: AuthenticatedActor): void {
    if (
      !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "No tenés permisos para publicar en nombre de la organización.",
      );
    }
  }
}
