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
  metaConnectionCanPublish,
  type MediaAssetRepository,
  type MediaStorage,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type OutboxMessageRecord,
  type OutboxTransport,
  type PublicationOrderJob,
  type PublicationOrderRepository,
  type PublicationOrderTargetRecord,
  type SafeJsonObject,
  type SupportedMediaMimeType,
} from "@aramayo/domain";

import type { FacebookPublisher } from "./facebook-publisher.service.ts";
import type { InstagramPublisher } from "./instagram-publisher.service.ts";

/** Caja a la que la variante `meta-feed` limita el lado largo de la pieza. */
const deliveryLongestSide = 1440;

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

function objectAt(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`El snapshot aprobado no contiene ${field}.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Medidas que va a entregar la URL.
 *
 * La variante `meta-feed` recorta con `limit`: nunca agranda y sólo achica lo
 * que excede la caja, conservando la proporción. Los publicadores validan
 * contra estas medidas y no contra las del activo, porque son las que Meta va a
 * descargar.
 */
function deliveredSize(
  width: number,
  height: number,
): Readonly<{ height: number; width: number }> {
  const longest = Math.max(width, height);
  if (longest <= deliveryLongestSide) return Object.freeze({ height, width });
  const factor = deliveryLongestSide / longest;
  return Object.freeze({
    height: Math.round(height * factor),
    width: Math.round(width * factor),
  });
}

interface ApprovedPiece {
  readonly caption: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: SupportedMediaMimeType;
  readonly width: number;
}

/**
 * Lo que se publica sale del snapshot y no del borrador.
 *
 * Un borrador puede haber cambiado después de la aprobación; el snapshot es lo
 * que alguien revisó y aprobó, y es lo único que puede salir.
 */
function approvedPiece(job: PublicationOrderJob): ApprovedPiece {
  const snapshot = objectAt(job.snapshot, "el documento");
  const rendered = objectAt(snapshot["renderedMedia"], "renderedMedia");
  const content = objectAt(snapshot["content"], "content");

  const mediaAssetId = rendered["mediaAssetId"];
  const checksumSha256 = rendered["checksumSha256"];
  const mimeType = rendered["mimeType"];
  const width = rendered["width"];
  const height = rendered["height"];
  const caption = content["caption"];
  if (
    typeof mediaAssetId !== "string" ||
    typeof checksumSha256 !== "string" ||
    (mimeType !== "image/png" && mimeType !== "image/jpeg") ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof caption !== "string"
  ) {
    throw new Error("El snapshot aprobado no describe una pieza publicable.");
  }
  return Object.freeze({
    caption,
    checksumSha256,
    height,
    mediaAssetId,
    mimeType,
    width,
  });
}

export class PublicationOrderOutboxTransport implements OutboxTransport {
  readonly #connections: MetaConnectionRepository;
  readonly #credentials: PublicationCredentialPort;
  readonly #facebook: FacebookPublisher;
  readonly #instagram: InstagramPublisher;
  readonly #media: MediaAssetRepository;
  readonly #now: () => Date;
  readonly #orders: PublicationOrderRepository;
  readonly #storage: MediaStorage;

  constructor(
    orders: PublicationOrderRepository,
    connections: MetaConnectionRepository,
    credentials: PublicationCredentialPort,
    media: MediaAssetRepository,
    storage: MediaStorage,
    instagram: InstagramPublisher,
    facebook: FacebookPublisher,
    options: PublicationOrderClock = {},
  ) {
    this.#connections = connections;
    this.#credentials = credentials;
    this.#facebook = facebook;
    this.#instagram = instagram;
    this.#media = media;
    this.#now = options.now ?? ((): Date => new Date());
    this.#orders = orders;
    this.#storage = storage;
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
      await this.#attemptAll(job, pending);
    }
    await this.#settleIfResolved(message.organizationId, orderId);
  }

  async #attemptAll(
    job: PublicationOrderJob,
    pending: readonly PublicationOrderTargetRecord[],
  ): Promise<void> {
    const piece = approvedPiece(job);
    const asset = await this.#media.findById(
      { organizationId: job.organizationId },
      piece.mediaAssetId,
    );
    if (
      asset === null ||
      asset.storageKey === undefined ||
      asset.storageVersion === undefined
    ) {
      throw new Error("La pieza aprobada ya no está disponible.");
    }
    // El snapshot fija qué bytes se aprobaron. Si el activo dejó de coincidir,
    // publicar sería sacar algo que nadie revisó.
    if (asset.checksumSha256 !== piece.checksumSha256) {
      throw new Error("La pieza almacenada no coincide con la aprobada.");
    }

    const url = this.#storage.deliveryUrl(
      {
        mimeType: piece.mimeType,
        storageKey: asset.storageKey,
        storageVersion: asset.storageVersion,
      },
      "meta-feed",
    );
    const media = Object.freeze({
      ...deliveredSize(piece.width, piece.height),
      url,
    });

    const connection = await this.#publishableConnection(job.organizationId);
    const accessToken = await this.#credentials.pageAccessToken(
      job.organizationId,
      connection.id,
    );
    if (accessToken === null) {
      throw new Error("La conexión no guarda el token de la Page.");
    }

    for (const target of pending) {
      // Cada destino se atiende dentro de su propio intento de error: uno que
      // rompa no puede impedir el siguiente ni alterar su resultado.
      await this.#attemptOne(job, target, {
        accessToken,
        caption: piece.caption,
        connection,
        media,
      });
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

  async #publishableConnection(
    organizationId: string,
  ): Promise<MetaConnectionRecord> {
    const connections = await this.#connections.list(organizationId);
    const connection = connections.find(metaConnectionCanPublish);
    if (connection === undefined) {
      throw new Error(
        "La organización no tiene una conexión Meta habilitada para publicar.",
      );
    }
    return connection;
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
