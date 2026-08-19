/**
 * Publicador de una pieza en la Page de Facebook.
 *
 * Mismo orden que Instagram y por las mismas razones: primero lo que no cuesta
 * una llamada —conexión, activo, pieza y copy—, después la sonda de la URL, y
 * recién ahí la primera llamada que deja algo del lado de Meta.
 *
 * La diferencia está en qué pasa cuando el pedido de publicación queda ambiguo.
 * En Instagram el contenedor sabe responder si ya se publicó, así que el
 * reintento reconcilia y sigue solo. Acá la foto preparada responde
 * `page_story_id` cuando la publicación existe, pero su ausencia no prueba lo
 * contrario: Meta documenta que el campo puede faltar. Frente a esa duda el
 * publicador se detiene en `outcome_unknown` en vez de elegir. Publicar de
 * nuevo duplicaría en la Page de un negocio real; declararlo fallido escondería
 * una publicación que quizá está a la vista. Ninguna de las dos es una decisión
 * del worker.
 *
 * Cada destino tiene su propia fila en el diario, con su propia clave. Un fallo
 * acá no puede tocar el resultado de Instagram porque no comparten estado: lo
 * único común es el contrato.
 */

import {
  metaConnectionCanPublish,
  validateFacebookCopy,
  validateFacebookDelivery,
  validateFacebookGeometry,
  MetaPublishingError,
  type FacebookMediaGeometry,
  type FacebookMediaRejection,
  type FacebookPublishingPort,
  type MetaConnectionRecord,
  type MetaPublishingAttemptChange,
  type MetaPublishingAttemptFailure,
  type MetaPublishingAttemptJournal,
  type MetaPublishingAttemptRecord,
  type PublicMediaProbePort,
} from "@aramayo/domain";

export interface PublishToFacebookCommand {
  /** Token de la Page, ya descifrado por quien invoca. */
  readonly accessToken: string;
  readonly attemptId: string;
  readonly connection: MetaConnectionRecord;
  readonly copy: string;
  /** Lo que la URL entrega, no lo que guarda el activo. */
  readonly media: FacebookMediaGeometry;
  readonly organizationId: string;
  /** Clave del destino. Repetir el comando con la misma clave no duplica. */
  readonly publicationTargetId: string;
}

export type FacebookPublishOutcome =
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      permalink?: string;
      postId: string;
      status: "already-published";
    }>
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      permalink?: string;
      postId: string;
      status: "published";
    }>
  /**
   * El pedido quedó ambiguo y Meta no puede decir si la publicación existe.
   * No se reintenta ni se declara fallido: necesita una decisión humana.
   */
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      stagedPhotoId?: string;
      status: "outcome-unknown";
    }>
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      failure: MetaPublishingAttemptFailure;
      status: "failed";
    }>
  /** Otro trabajador escribió el intento primero; este no toca nada más. */
  | Readonly<{ status: "conflict" }>;

export interface FacebookPublisherOptions {
  readonly now?: () => number;
}

function failureOf(error: MetaPublishingError): MetaPublishingAttemptFailure {
  return Object.freeze({
    code: error.code,
    detail: error.detail,
    retryable: error.retryable,
  });
}

function rejectionFailure(
  rejection: FacebookMediaRejection,
): MetaPublishingAttemptFailure {
  return Object.freeze({
    code: "validation-failed" as const,
    detail: `${rejection.reason} ${rejection.correction}`,
    retryable: false,
  });
}

/**
 * Una foto preparada que venció deja de servir. Cualquier otro fallo la
 * conserva: es lo único que permite preguntar después si la publicación existe.
 */
function keepsStagedPhoto(failure: MetaPublishingAttemptFailure): boolean {
  return failure.code !== "staged-media-expired";
}

/**
 * Un fallo que deja en duda si la publicación salió.
 *
 * Un timeout o un 5xx pueden haber llegado a Meta. Un rechazo explícito
 * —permiso, credencial, pieza inválida, validación— no creó nada, así que el
 * reintento es seguro.
 */
function leavesOutcomeInDoubt(failure: MetaPublishingAttemptFailure): boolean {
  return (
    failure.code === "request-timeout" || failure.code === "provider-error"
  );
}

export class FacebookPublisher {
  readonly #journal: MetaPublishingAttemptJournal;
  readonly #now: () => number;
  readonly #probe: PublicMediaProbePort;
  readonly #publishing: FacebookPublishingPort;

  constructor(
    publishing: FacebookPublishingPort,
    journal: MetaPublishingAttemptJournal,
    probe: PublicMediaProbePort,
    options: FacebookPublisherOptions = {},
  ) {
    this.#journal = journal;
    this.#now = options.now ?? Date.now;
    this.#probe = probe;
    this.#publishing = publishing;
  }

  async publish(
    command: PublishToFacebookCommand,
  ): Promise<FacebookPublishOutcome> {
    const stored = await this.#journal.find({
      organizationId: command.organizationId,
      publicationTargetId: command.publicationTargetId,
    });
    const settled = settledOutcome(stored);
    if (settled !== null) return settled;

    const sequence = stored?.sequence ?? 0;
    const assetId = publishablePageId(command);
    if (assetId === null) {
      return this.#fail(
        command,
        sequence,
        Object.freeze({
          code: "permission-denied" as const,
          detail:
            "La conexión Meta no está habilitada para publicar en esa Page.",
          retryable: false,
        }),
        stored?.stagedMediaId,
      );
    }

    const rejection = await this.#reject(command);
    if (rejection !== null) {
      return this.#fail(command, sequence, rejection, stored?.stagedMediaId);
    }
    return this.#run(command, sequence, assetId, stored?.stagedMediaId);
  }

  /**
   * Camino con llamadas a Meta.
   *
   * Si ya hay una foto preparada, lo primero es preguntarle si su publicación
   * existe: reconciliar antes de volver a pedir nada.
   */
  async #run(
    command: PublishToFacebookCommand,
    storedSequence: number,
    assetId: string,
    storedPhotoId: string | undefined,
  ): Promise<FacebookPublishOutcome> {
    let sequence = storedSequence;
    let stagedPhotoId = storedPhotoId;

    try {
      if (stagedPhotoId === undefined) {
        stagedPhotoId = (
          await this.#publishing.stagePhoto(
            { imageUrl: command.media.url, pageAssetId: assetId },
            command.accessToken,
          )
        ).photoId;
        // Antes de pedir la publicación: es lo único que puede responder
        // después si esta corrida llegó a publicar.
        const written = await this.#save(command, {
          sequence: sequence + 1,
          stagedMediaId: stagedPhotoId,
          state: "media_staged",
        });
        if (written === null) {
          return Object.freeze({ status: "conflict" as const });
        }
        sequence += 1;
      } else {
        const report = await this.#publishing.readStagedPhoto(
          stagedPhotoId,
          command.accessToken,
        );
        if (report.postId !== undefined) {
          return await this.#settlePublished(
            command,
            sequence,
            stagedPhotoId,
            report.postId,
          );
        }
      }

      const post = await this.#publishing.createPagePost(
        { copy: command.copy, pageAssetId: assetId, stagedPhotoId },
        command.accessToken,
      );
      return await this.#settlePublished(
        command,
        sequence,
        stagedPhotoId,
        post.postId,
      );
    } catch (cause: unknown) {
      if (!(cause instanceof MetaPublishingError)) throw cause;
      const failure = failureOf(cause);
      const keptPhotoId = keepsStagedPhoto(failure) ? stagedPhotoId : undefined;
      // Un fallo ambiguo que ocurrió con una foto ya preparada pudo haber
      // creado la publicación. No se marca fallido: se detiene.
      return leavesOutcomeInDoubt(failure) && stagedPhotoId !== undefined
        ? this.#settleUnknown(command, sequence, stagedPhotoId)
        : this.#fail(command, sequence, failure, keptPhotoId);
    }
  }

  /**
   * Registra la publicación confirmada.
   *
   * El enlace se lee antes de guardar para que quede en el mismo registro: leerlo
   * después obligaría a una segunda escritura, y consultarlo en cada repetición
   * gastaría una llamada por algo que ya no cambia. Es una lectura opcional —si
   * falla devuelve `null`— y nunca pone en duda la publicación.
   */
  async #settlePublished(
    command: PublishToFacebookCommand,
    sequence: number,
    stagedPhotoId: string,
    postId: string,
  ): Promise<FacebookPublishOutcome> {
    const permalink = await this.#publishing.readPermalink(
      postId,
      command.accessToken,
    );
    const attempt = await this.#save(command, {
      ...(permalink === null ? {} : { remotePermalink: permalink }),
      remotePostId: postId,
      sequence: sequence + 1,
      stagedMediaId: stagedPhotoId,
      state: "published",
    });
    return attempt === null
      ? Object.freeze({ status: "conflict" as const })
      : Object.freeze({
          attempt,
          ...(permalink === null ? {} : { permalink }),
          postId,
          status: "published" as const,
        });
  }

  async #settleUnknown(
    command: PublishToFacebookCommand,
    sequence: number,
    stagedPhotoId: string,
  ): Promise<FacebookPublishOutcome> {
    const attempt = await this.#save(command, {
      sequence: sequence + 1,
      stagedMediaId: stagedPhotoId,
      state: "outcome_unknown",
    });
    return attempt === null
      ? Object.freeze({ status: "conflict" as const })
      : Object.freeze({
          attempt,
          stagedPhotoId,
          status: "outcome-unknown" as const,
        });
  }

  /** Validaciones que no cuestan una llamada a Meta, y la sonda de la URL. */
  async #reject(
    command: PublishToFacebookCommand,
  ): Promise<MetaPublishingAttemptFailure | null> {
    const copy = validateFacebookCopy(command.copy);
    if (copy.status === "rejected") return rejectionFailure(copy.rejection);

    const geometry = validateFacebookGeometry(command.media);
    if (geometry.status === "rejected") {
      return rejectionFailure(geometry.rejection);
    }

    const probed = await this.#probe.probe(command.media.url);
    if (probed.status === "unreachable") {
      return Object.freeze({
        code: "media-unreachable" as const,
        detail:
          "La dirección pública de la pieza no respondió con una imagen descargable.",
        retryable: true,
      });
    }
    const delivery = validateFacebookDelivery(probed);
    return delivery.status === "rejected"
      ? rejectionFailure(delivery.rejection)
      : null;
  }

  async #fail(
    command: PublishToFacebookCommand,
    sequence: number,
    failure: MetaPublishingAttemptFailure,
    stagedPhotoId: string | undefined,
  ): Promise<FacebookPublishOutcome> {
    const attempt = await this.#save(command, {
      failure,
      sequence: sequence + 1,
      ...(stagedPhotoId === undefined ? {} : { stagedMediaId: stagedPhotoId }),
      state: "failed",
    });
    return attempt === null
      ? Object.freeze({ status: "conflict" as const })
      : Object.freeze({ attempt, failure, status: "failed" as const });
  }

  async #save(
    command: PublishToFacebookCommand,
    change: MetaPublishingAttemptChange,
  ): Promise<MetaPublishingAttemptRecord | null> {
    const record: MetaPublishingAttemptRecord = Object.freeze({
      ...change,
      attemptId: command.attemptId,
      organizationId: command.organizationId,
      publicationTargetId: command.publicationTargetId,
      updatedAt: new Date(this.#now()).toISOString(),
    });
    return (await this.#journal.save(record)) === "saved" ? record : null;
  }
}

/**
 * Un intento ya resuelto no vuelve a llamar a Meta.
 *
 * Un identificador remoto es prueba de que la publicación existe, cualquiera
 * sea el estado con el que quedó registrada. Un estado publicado sin ese
 * identificador, o un desenlace desconocido, se devuelven como desconocidos: no
 * se reintentan, porque las dos salidas automáticas —duplicar o abandonar— son
 * peores que esperar la decisión de una persona.
 */
function settledOutcome(
  stored: MetaPublishingAttemptRecord | null,
): FacebookPublishOutcome | null {
  if (stored === null) return null;
  if (stored.remotePostId !== undefined) {
    return Object.freeze({
      attempt: stored,
      ...(stored.remotePermalink === undefined
        ? {}
        : { permalink: stored.remotePermalink }),
      postId: stored.remotePostId,
      status: "already-published" as const,
    });
  }
  return stored.state === "outcome_unknown" || stored.state === "published"
    ? Object.freeze({
        attempt: stored,
        ...(stored.stagedMediaId === undefined
          ? {}
          : { stagedPhotoId: stored.stagedMediaId }),
        status: "outcome-unknown" as const,
      })
    : null;
}

/**
 * Identificador de la Page habilitada para esta publicación.
 *
 * Exige salud, permisos completos y que el activo siga activo en esa conexión y
 * organización. Devuelve `null` cuando falta cualquiera: no hay destino y no se
 * llama a Meta.
 */
function publishablePageId(command: PublishToFacebookCommand): string | null {
  const { connection } = command;
  if (
    connection.organizationId !== command.organizationId ||
    !metaConnectionCanPublish(connection)
  ) {
    return null;
  }
  const asset = connection.assets.find(
    (candidate) => candidate.kind === "page" && candidate.status === "active",
  );
  return asset?.providerAssetId ?? null;
}
