/**
 * Publicador de una pieza en un destino de Instagram.
 *
 * Ordena lo que Meta separa en tres llamadas y agrega lo que ninguna de ellas
 * da: memoria. El orden no es estético. Primero se descartan los motivos que no
 * cuestan una llamada —la conexión, el activo, la pieza y el pie—, después se
 * confirma que la dirección pública existe realmente, y recién ahí se gasta un
 * contenedor. La cuota de Instagram se consume al crear el contenedor, no al
 * publicarlo: una pieza mal formada rechazada por Meta cuesta lo mismo que una
 * publicación.
 *
 * La regla que gobierna todo lo demás: el identificador del contenedor se
 * guarda antes de intentar publicarlo. Si el proceso muere entre publicar y
 * registrar el resultado, la corrida siguiente encuentra ese identificador,
 * le pregunta a Meta en qué estado quedó y decide. Sin ese dato, la única
 * salida sería publicar de nuevo y duplicar.
 *
 * Este publicador resuelve un destino. La orden multidestino, su estado
 * agregado y el estado de la publicación son de `P5-T05`; recuperar el
 * identificador de una publicación que Meta confirmó sin devolverlo es de
 * `P5-T06`.
 */

import {
  metaConnectionCanPublish,
  validateInstagramCaption,
  validateInstagramDelivery,
  validateInstagramGeometry,
  MetaPublishingError,
  type MetaPublishingAttemptChange,
  type MetaPublishingAttemptFailure,
  type MetaPublishingAttemptJournal,
  type MetaPublishingAttemptRecord,
  type InstagramContainerState,
  type InstagramMediaGeometry,
  type InstagramMediaRejection,
  type InstagramPublishTarget,
  type InstagramPublishingPort,
  type MetaConnectionRecord,
  type PublicMediaProbePort,
} from "@aramayo/domain";

export interface PublishToInstagramCommand {
  /** Token de la Page, ya descifrado por quien invoca. */
  readonly accessToken: string;
  readonly attemptId: string;
  readonly caption?: string;
  readonly connection: MetaConnectionRecord;
  /** Lo que la URL entrega, no lo que guarda el activo. */
  readonly media: InstagramMediaGeometry;
  readonly organizationId: string;
  /** Clave del destino. Repetir el comando con la misma clave no duplica. */
  readonly publicationTargetId: string;
  readonly target: InstagramPublishTarget;
}

export type InstagramPublishOutcome =
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      mediaId: string;
      status: "already-published";
    }>
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      mediaId: string;
      status: "published";
    }>
  /**
   * Meta confirmó que el contenedor está publicado sin devolver el
   * identificador de la publicación. `containerId` falta solo si el intento
   * almacenado tampoco lo tenía; recuperarlo es de `P5-T06`.
   */
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      containerId?: string;
      status: "published-unconfirmed";
    }>
  | Readonly<{
      attempt: MetaPublishingAttemptRecord;
      failure: MetaPublishingAttemptFailure;
      status: "failed";
    }>
  /** Otro trabajador escribió el intento primero; este no toca nada más. */
  | Readonly<{ status: "conflict" }>;

export interface InstagramPublisherOptions {
  readonly now?: () => number;
  readonly pollIntervalMilliseconds?: number;
  readonly processingDeadlineMilliseconds?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

const defaultPollIntervalMilliseconds = 3_000;
const defaultProcessingDeadlineMilliseconds = 120_000;

function failureOf(error: MetaPublishingError): MetaPublishingAttemptFailure {
  return Object.freeze({
    code: error.code,
    detail: error.detail,
    retryable: error.retryable,
  });
}

function rejectionFailure(
  rejection: InstagramMediaRejection,
): MetaPublishingAttemptFailure {
  return Object.freeze({
    code: "validation-failed" as const,
    detail: `${rejection.reason} ${rejection.correction}`,
    retryable: false,
  });
}

/**
 * Un contenedor vencido o con error deja de servir y no se conserva: un
 * reintento tiene que crear uno nuevo. Cualquier otro fallo lo conserva, porque
 * ese identificador es lo único que permite reconciliar después.
 */
function keepsContainer(failure: MetaPublishingAttemptFailure): boolean {
  return (
    failure.code !== "staged-media-expired" &&
    failure.code !== "processing-failed"
  );
}

export class InstagramPublisher {
  readonly #journal: MetaPublishingAttemptJournal;
  readonly #now: () => number;
  readonly #pollIntervalMilliseconds: number;
  readonly #probe: PublicMediaProbePort;
  readonly #processingDeadlineMilliseconds: number;
  readonly #publishing: InstagramPublishingPort;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(
    publishing: InstagramPublishingPort,
    journal: MetaPublishingAttemptJournal,
    probe: PublicMediaProbePort,
    options: InstagramPublisherOptions = {},
  ) {
    this.#journal = journal;
    this.#now = options.now ?? Date.now;
    this.#pollIntervalMilliseconds =
      options.pollIntervalMilliseconds ?? defaultPollIntervalMilliseconds;
    this.#probe = probe;
    this.#processingDeadlineMilliseconds =
      options.processingDeadlineMilliseconds ??
      defaultProcessingDeadlineMilliseconds;
    this.#publishing = publishing;
    this.#sleep =
      options.sleep ??
      ((milliseconds: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async publish(
    command: PublishToInstagramCommand,
  ): Promise<InstagramPublishOutcome> {
    const stored = await this.#journal.find({
      organizationId: command.organizationId,
      publicationTargetId: command.publicationTargetId,
    });
    const settled = settledOutcome(stored);
    if (settled !== null) return settled;

    const sequence = stored?.sequence ?? 0;
    const assetId = publishableAssetId(command);
    if (assetId === null) {
      return this.#fail(
        command,
        sequence,
        Object.freeze({
          code: "permission-denied" as const,
          detail:
            "La conexión Meta no está habilitada para publicar en esa cuenta de Instagram.",
          retryable: false,
        }),
        // El contenedor anterior se conserva aunque la conexión ya no sirva: si
        // se repara y esto lo hubiera borrado, el reintento crearía otro y
        // publicaría de nuevo lo que quizá ya salió.
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
   * Reconciliar primero: si ya hay contenedor, lo que decide es su estado y no
   * lo que la plataforma creía saber.
   *
   * El fallo se resuelve dentro de este método y no afuera porque solo acá se
   * conoce el contenedor vigente: uno creado en esta misma corrida no está en el
   * diario que se leyó al empezar, y perderlo obligaría al reintento a crear
   * otro y a publicar dos veces.
   */
  async #run(
    command: PublishToInstagramCommand,
    storedSequence: number,
    assetId: string,
    storedContainerId: string | undefined,
  ): Promise<InstagramPublishOutcome> {
    let sequence = storedSequence;
    let containerId = storedContainerId;

    try {
      if (containerId === undefined) {
        await this.#assertQuotaAvailable(assetId, command.accessToken);
        containerId = (
          await this.#publishing.createContainer(
            {
              ...(command.caption === undefined
                ? {}
                : { caption: command.caption }),
              imageUrl: command.media.url,
              instagramAssetId: assetId,
              target: command.target,
            },
            command.accessToken,
          )
        ).containerId;
        // Antes de cualquier intento de publicar: es el dato que permite saber
        // después si esta corrida llegó a publicar o no.
        const written = await this.#save(command, {
          sequence: sequence + 1,
          stagedMediaId: containerId,
          state: "media_staged",
        });
        if (written === null) {
          return Object.freeze({ status: "conflict" as const });
        }
        sequence += 1;
      }

      const state = await this.#awaitProcessable(
        containerId,
        command.accessToken,
      );
      if (state === "published") {
        return await this.#settleUnconfirmed(command, sequence, containerId);
      }

      const published = await this.#publishing.publishContainer(
        { containerId, instagramAssetId: assetId },
        command.accessToken,
      );
      const attempt = await this.#save(command, {
        remotePostId: published.mediaId,
        sequence: sequence + 1,
        stagedMediaId: containerId,
        state: "published",
      });
      // Perder la escritura después de publicar deja la publicación hecha sin
      // registro propio. No se pierde: quien ganó la carrera tiene el
      // contenedor, y Meta lo informa `PUBLISHED`, así que ese trabajador
      // termina en «publicado sin confirmar» en vez de publicar otra vez.
      return attempt === null
        ? Object.freeze({ status: "conflict" as const })
        : Object.freeze({
            attempt,
            mediaId: published.mediaId,
            status: "published" as const,
          });
    } catch (cause: unknown) {
      if (!(cause instanceof MetaPublishingError)) throw cause;
      const failure = failureOf(cause);
      return this.#fail(
        command,
        sequence,
        failure,
        keepsContainer(failure) ? containerId : undefined,
      );
    }
  }

  /**
   * Espera a que el contenedor sea publicable.
   *
   * `published` corta la espera sin publicar: significa que un intento anterior
   * ya lo publicó. `error` y `expired` se propagan como fallo. Agotar el plazo
   * conserva el contenedor, porque puede terminar de procesar después.
   */
  async #awaitProcessable(
    containerId: string,
    accessToken: string,
  ): Promise<Extract<InstagramContainerState, "finished" | "published">> {
    const deadline = this.#now() + this.#processingDeadlineMilliseconds;
    for (;;) {
      const report = await this.#publishing.readContainer(
        containerId,
        accessToken,
      );
      if (report.state === "finished" || report.state === "published") {
        return report.state;
      }
      if (report.state === "error") {
        throw new MetaPublishingError(
          "processing-failed",
          "Meta no pudo procesar la pieza.",
          false,
        );
      }
      if (report.state === "expired") {
        throw new MetaPublishingError(
          "staged-media-expired",
          "El contenedor venció antes de publicarse.",
          true,
        );
      }
      if (this.#now() + this.#pollIntervalMilliseconds > deadline) {
        throw new MetaPublishingError(
          "processing-timeout",
          "Meta sigue procesando la pieza y se agotó el plazo de espera.",
          true,
        );
      }
      await this.#sleep(this.#pollIntervalMilliseconds);
    }
  }

  async #assertQuotaAvailable(
    assetId: string,
    accessToken: string,
  ): Promise<void> {
    const quota = await this.#publishing.readPublishingQuota(
      assetId,
      accessToken,
    );
    if (quota.quotaUsage >= quota.quotaTotal) {
      throw new MetaPublishingError(
        "publishing-limit-reached",
        `La cuenta usó ${String(quota.quotaUsage)} de ${String(quota.quotaTotal)} publicaciones de la ventana vigente.`,
        false,
      );
    }
  }

  /** Validaciones que no cuestan una llamada a Meta, y la sonda de la URL. */
  async #reject(
    command: PublishToInstagramCommand,
  ): Promise<MetaPublishingAttemptFailure | null> {
    const caption = validateInstagramCaption(command.target, command.caption);
    if (caption.status === "rejected") {
      return rejectionFailure(caption.rejection);
    }
    // La geometría se conoce sin tocar la red: una pieza del formato
    // equivocado no justifica ni siquiera la consulta de encabezados.
    const geometry = validateInstagramGeometry(command.target, command.media);
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
    const delivery = validateInstagramDelivery(probed);
    return delivery.status === "rejected"
      ? rejectionFailure(delivery.rejection)
      : null;
  }

  async #settleUnconfirmed(
    command: PublishToInstagramCommand,
    sequence: number,
    containerId: string,
  ): Promise<InstagramPublishOutcome> {
    const attempt = await this.#save(command, {
      sequence: sequence + 1,
      stagedMediaId: containerId,
      state: "published_unconfirmed",
    });
    return attempt === null
      ? Object.freeze({ status: "conflict" as const })
      : Object.freeze({
          attempt,
          containerId,
          status: "published-unconfirmed" as const,
        });
  }

  async #fail(
    command: PublishToInstagramCommand,
    sequence: number,
    failure: MetaPublishingAttemptFailure,
    containerId: string | undefined,
  ): Promise<InstagramPublishOutcome> {
    const attempt = await this.#save(command, {
      failure,
      sequence: sequence + 1,
      ...(containerId === undefined ? {} : { stagedMediaId: containerId }),
      state: "failed",
    });
    return attempt === null
      ? Object.freeze({ status: "conflict" as const })
      : Object.freeze({ attempt, failure, status: "failed" as const });
  }

  async #save(
    command: PublishToInstagramCommand,
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
 * Es la garantía de que repetir el comando no publica dos veces. Un intento sin
 * confirmar tampoco reintenta: Meta ya dijo que el contenedor está publicado,
 * y volver a publicarlo produciría la segunda publicación que esto evita.
 */
function settledOutcome(
  stored: MetaPublishingAttemptRecord | null,
): InstagramPublishOutcome | null {
  if (stored === null) return null;
  if (
    stored.state !== "published" &&
    stored.state !== "published_unconfirmed"
  ) {
    return null;
  }
  if (stored.remotePostId !== undefined) {
    return Object.freeze({
      attempt: stored,
      mediaId: stored.remotePostId,
      status: "already-published" as const,
    });
  }
  // Publicado sin identificador. No debería ocurrir, pero si ocurre se resuelve
  // como sin confirmar y no volviendo a publicar: el estado ya dice que salió, y
  // reintentar por falta de un dato local produciría la segunda publicación.
  return Object.freeze({
    attempt: stored,
    ...(stored.stagedMediaId === undefined
      ? {}
      : { containerId: stored.stagedMediaId }),
    status: "published-unconfirmed" as const,
  });
}

/**
 * Identificador de la cuenta de Instagram habilitada para esta publicación.
 *
 * Exige salud, permisos completos y que el activo siga activo en esa conexión y
 * organización. Devuelve `null` cuando falta cualquiera de esas condiciones: no
 * hay destino al que publicar y no se llama a Meta.
 */
function publishableAssetId(command: PublishToInstagramCommand): string | null {
  const { connection } = command;
  if (
    connection.organizationId !== command.organizationId ||
    !metaConnectionCanPublish(connection)
  ) {
    return null;
  }
  const asset = connection.assets.find(
    (candidate) =>
      candidate.kind === "instagram_business" && candidate.status === "active",
  );
  return asset?.providerAssetId ?? null;
}
