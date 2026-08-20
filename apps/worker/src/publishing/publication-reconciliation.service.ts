/**
 * Reconciliación de publicaciones con desenlace abierto.
 *
 * Este servicio existe porque hay estados que no se resuelven solos y que nadie
 * puede resolver adivinando. Un contenedor preparado, una publicación que Meta
 * confirmó sin devolver identificador y un pedido que quedó sin respuesta son
 * tres formas de la misma pregunta: **¿existe la publicación?** La única fuente
 * que puede contestarla es el proveedor, y este barrido es el que va a
 * preguntarle.
 *
 * Lo importante es lo que el barrido **no** hace. No publica. Todas sus
 * llamadas son lecturas, así que correrlo de más no puede duplicar nada; lo
 * peor que puede pasar es gastar cuota. Esa asimetría es deliberada: el paso
 * que decide si hay que publicar de nuevo tiene que ser incapaz de publicar por
 * su cuenta.
 *
 * Cada destino se reconcilia dentro de su propio manejo de errores, por el
 * mismo motivo que al publicar: una consulta que rompe no puede impedir que se
 * revisen los demás.
 */

import {
  metaConnectionCanPublish,
  needsPublicationReconciliation,
  reconcilePublicationTarget,
  type MetaConnectionRecord,
  type MetaConnectionRepository,
  type MetaPublishingAttemptJournal,
  type MetaPublishingAttemptRecord,
  type PublicationRetryRepository,
  type PublicationRetryTargetRecord,
  type RemotePublicationEvidence,
} from "@aramayo/domain";

import type { PublicationCredentialPort } from "./publication-order.transport.ts";

/**
 * Consulta al proveedor si la publicación existe.
 *
 * Se declara como puerto y no se resuelve acá adentro porque cada destino
 * pregunta distinto —el contenedor de Instagram y la foto sin publicar de la
 * Page no se consultan igual— y porque una consulta remota tiene que poder
 * reemplazarse por un doble sin tocar la lógica que decide.
 */
export interface RemotePublicationLookupPort {
  lookup(
    input: Readonly<{
      accessToken: string;
      /** Trae los anclajes remotos: contenedor preparado e identificador. */
      attempt: MetaPublishingAttemptRecord;
      connection: MetaConnectionRecord;
      target: PublicationRetryTargetRecord;
    }>,
  ): Promise<RemotePublicationEvidence>;
}

export interface PublicationReconciliationSummary {
  /** Destinos que resultaron publicados, con identificador o sin él. */
  readonly confirmed: number;
  /** Consultas que no se pudieron hacer. */
  readonly failed: number;
  readonly reviewed: number;
  /** Destinos comprobados ausentes que vuelven a la cola. */
  readonly republishable: number;
  /** Destinos que siguen sin resolverse y quedan para una persona. */
  readonly unresolved: number;
}

export interface PublicationReconciliationOptions {
  readonly now?: () => Date;
}

export class PublicationReconciliationService {
  readonly #connections: MetaConnectionRepository;
  readonly #credentials: PublicationCredentialPort;
  readonly #journal: MetaPublishingAttemptJournal;
  readonly #lookup: RemotePublicationLookupPort;
  readonly #now: () => Date;
  readonly #retries: PublicationRetryRepository;

  constructor(
    retries: PublicationRetryRepository,
    journal: MetaPublishingAttemptJournal,
    connections: MetaConnectionRepository,
    credentials: PublicationCredentialPort,
    lookup: RemotePublicationLookupPort,
    options: PublicationReconciliationOptions = {},
  ) {
    this.#connections = connections;
    this.#credentials = credentials;
    this.#journal = journal;
    this.#lookup = lookup;
    this.#now = options.now ?? ((): Date => new Date());
    this.#retries = retries;
  }

  async reconcileBatch(
    limit: number,
  ): Promise<PublicationReconciliationSummary> {
    const open = await this.#retries.openOutcomes(limit);
    let confirmed = 0;
    let failed = 0;
    let republishable = 0;
    let unresolved = 0;

    for (const target of open) {
      // El barrido lee por estado, pero el estado pudo cambiar entre la lectura
      // y esta línea. Se vuelve a preguntar antes de gastar una llamada remota.
      if (!needsPublicationReconciliation(target.state)) continue;
      try {
        const outcome = await this.#reconcileOne(target);
        if (outcome === "confirmed") confirmed += 1;
        if (outcome === "republishable") republishable += 1;
        if (outcome === "unresolved") unresolved += 1;
      } catch {
        // Una consulta que rompe no puede impedir que se revisen los demás.
        failed += 1;
      }
    }

    return Object.freeze({
      confirmed,
      failed,
      reviewed: open.length,
      republishable,
      unresolved,
    });
  }

  async #reconcileOne(
    target: PublicationRetryTargetRecord,
  ): Promise<"confirmed" | "republishable" | "unchanged" | "unresolved"> {
    const attempt = await this.#journal.find({
      organizationId: target.organizationId,
      publicationTargetId: target.publicationTargetId,
    });
    if (attempt === null) return "unchanged";

    const connection = await this.#publishableConnection(target.organizationId);
    const accessToken = await this.#credentials.pageAccessToken(
      target.organizationId,
      connection.id,
    );
    if (accessToken === null) {
      throw new Error("La conexión no guarda el token de la Page.");
    }

    const evidence = await this.#lookup.lookup({
      accessToken,
      attempt,
      connection,
      target,
    });
    const decision = reconcilePublicationTarget(attempt, evidence);
    const reconciledAt = this.#now().toISOString();
    const scope = {
      organizationId: target.organizationId,
      publicationTargetId: target.publicationTargetId,
      // La secuencia que se leyó del intento, no la del barrido: entre las dos
      // lecturas un publicador pudo escribir, y la condición tiene que fallar
      // si eso pasó.
      sequence: attempt.sequence,
    };

    switch (decision.status) {
      case "confirmed":
        await this.#retries.confirmRemotePublication({
          ...scope,
          reconciledAt,
          ...(decision.remotePermalink === undefined
            ? {}
            : { remotePermalink: decision.remotePermalink }),
          remotePostId: decision.remotePostId,
        });
        return "confirmed";
      case "confirmed-unidentified":
        await this.#retries.confirmWithoutIdentifier({
          ...scope,
          reconciledAt,
        });
        return "confirmed";
      case "republishable":
        await this.#retries.reopenForRepublish({ ...scope, reconciledAt });
        return "republishable";
      case "unresolved":
        // Sigue sin saberse. Se deja anotado para que una persona lo vea, y no
        // se toca el estado: el destino sigue tan en duda como antes.
        await this.#retries.requireManualAction({
          ...scope,
          reason: "outcome-unresolved",
        });
        return "unresolved";
      case "already-settled":
        return "unchanged";
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
}
