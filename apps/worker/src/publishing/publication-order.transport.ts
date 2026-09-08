/**
 * Consumidor de órdenes de publicación.
 *
 * Toma la orden, resuelve una sola vez lo que es común —la pieza aprobada, su
 * URL pública y la credencial— y después recorre los destinos pendientes
 * atendiendo cada uno por separado. Ese «por separado» es literal: cada destino
 * se envuelve en su propio manejo de errores, así que una excepción publicando
 * en Facebook no puede impedir que Instagram se intente ni tocar su resultado.
 * Es la garantía que pide el criterio, y la única forma de sostenerla es no
 * dejar que un fallo se propague fuera del destino que lo produjo.
 *
 * La orden se cierra cuando ninguno de sus destinos sigue en curso, y el estado
 * con el que cierra sale de `publicationOrderStatus`. Un destino en duda deja la
 * orden abierta a propósito: no se puede declarar terminada algo cuyo desenlace
 * nadie conoce.
 *
 * Lo que este consumidor no hace es reintentar. Un destino que falló de forma
 * recuperable queda registrado con su código y su bandera; programar el
 * reintento es de `P5-T06`.
 */

import {
  pendingPublicationTargets,
  publicationOrderStatus,
  publicationOrderTopic,
  type MetaConnectionRecord,
  type OutboxMessageRecord,
  type OutboxTransport,
  type PublicationOrderJob,
  type PublicationOrderRepository,
  type PublicationOrderTargetRecord,
  type SafeJsonObject,
} from "@aramayo/domain";

import type { FacebookPublisher } from "./facebook-publisher.service.ts";
import type { InstagramPublisher } from "./instagram-publisher.service.ts";
import type {
  PrePublishReadyContext,
  PrePublishValidatorPort,
} from "./pre-publish.validator.ts";

export interface PublicationOrderClock {
  readonly now?: () => Date;
}

/** Credencial ya descifrada, tal como la necesitan los publicadores. */
export interface PublicationCredentialPort {
  /**
   * Token de la Page de esa conexión. Devuelve `null` cuando la conexión no lo
   * guarda: sin él no se publica en ningún destino, porque Instagram también
   * usa el de la Page.
   */
  pageAccessToken(
    organizationId: string,
    metaConnectionId: string,
  ): Promise<string | null>;
}

function payloadText(payload: SafeJsonObject, field: string): string {
  const entry = payload[field];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`El evento de publicación no contiene ${field}.`);
  }
  return entry;
}

export class PublicationOrderOutboxTransport implements OutboxTransport {
  readonly #facebook: FacebookPublisher;
  readonly #instagram: InstagramPublisher;
  readonly #now: () => Date;
  readonly #orders: PublicationOrderRepository;
  readonly #validator: PrePublishValidatorPort;

  constructor(
    orders: PublicationOrderRepository,
    validator: PrePublishValidatorPort,
    instagram: InstagramPublisher,
    facebook: FacebookPublisher,
    options: PublicationOrderClock = {},
  ) {
    this.#facebook = facebook;
    this.#instagram = instagram;
    this.#now = options.now ?? ((): Date => new Date());
    this.#orders = orders;
    this.#validator = validator;
  }

  async deliver(message: OutboxMessageRecord): Promise<void> {
    if (message.topic !== publicationOrderTopic) {
      throw new Error("El evento outbox todavía no tiene un consumidor.");
    }
    const orderId = payloadText(message.payload, "orderId");
    const job = await this.#orders.findJob(message.organizationId, orderId);
    if (job === null) {
      throw new Error(
        "La orden de publicación no coincide con el estado actual.",
      );
    }

    const order = await this.#orders.findById(message.organizationId, orderId);
    if (order === null) {
      throw new Error("La orden de publicación desapareció.");
    }
    const pending = pendingPublicationTargets(order);
    if (pending.length > 0) {
      const validation = await this.#validator.validate(job, pending);
      if (validation.status === "blocked") {
        await this.#orders.blockPrePublish({
          actorMembershipId: job.requestedByMembershipId,
          code: validation.code,
          occurredAt: this.#now().toISOString(),
          orderId: job.orderId,
          organizationId: job.organizationId,
          safeMessage: validation.safeMessage,
        });
        return;
      }
      await this.#attemptAll(job, pending, validation.context);
    }
    await this.#settleIfResolved(message.organizationId, orderId);
  }

  async #attemptAll(
    job: PublicationOrderJob,
    pending: readonly PublicationOrderTargetRecord[],
    context: PrePublishReadyContext,
  ): Promise<void> {
    for (const target of pending) {
      // Cada destino se atiende dentro de su propio intento de error: uno que
      // rompa no puede impedir el siguiente ni alterar su resultado.
      await this.#attemptOne(job, target, context);
    }
  }

  async #attemptOne(
    job: PublicationOrderJob,
    target: PublicationOrderTargetRecord,
    context: Readonly<{
      accessToken: string;
      caption: string;
      connection: MetaConnectionRecord;
      media: Readonly<{ height: number; url: string; width: number }>;
    }>,
  ): Promise<void> {
    const shared = {
      accessToken: context.accessToken,
      attemptId: `${job.orderId}:${target.target}`,
      connection: context.connection,
      media: context.media,
      organizationId: job.organizationId,
      publicationTargetId: target.publicationTargetId,
    };
    try {
      if (target.target === "facebook_page") {
        await this.#facebook.publish({ ...shared, copy: context.caption });
        return;
      }
      await this.#instagram.publish({
        ...shared,
        // Una historia no lleva pie: enviarlo prometería un texto invisible.
        ...(target.target === "instagram_story"
          ? {}
          : { caption: context.caption }),
        target: target.target,
      });
    } catch {
      // El publicador ya registró lo que pudo. Lo que no se puede permitir es
      // que este destino se lleve puestos a los demás.
    }
  }

  /**
   * Cierra la orden si ya no queda nada en curso.
   *
   * `publicationOrderStatus` decide: mientras devuelva `publishing` hay algo sin
   * resolver —trabajo pendiente o un desenlace en duda— y la orden sigue
   * abierta.
   */
  async #settleIfResolved(
    organizationId: string,
    orderId: string,
  ): Promise<void> {
    const order = await this.#orders.findById(organizationId, orderId);
    if (order === null) return;
    if (publicationOrderStatus(order.targets) === "publishing") return;
    await this.#orders.settle(
      organizationId,
      orderId,
      this.#now().toISOString(),
    );
  }
}
