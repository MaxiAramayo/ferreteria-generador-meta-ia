/**
 * Barrido de la bandeja operativa.
 *
 * No interpreta respuestas de Meta ni toma decisiones de publicación: delega
 * la detección a la consulta persistente y se limita a ejecutar la política de
 * umbrales. Así un timer repetido es idempotente y puede correr aunque Meta no
 * esté configurada, para seguir detectando un calendario detenido.
 */

import {
  publicationOperationalAlertPolicy,
  type PublicationOperationalAlertRepository,
  type PublicationOperationalAlertSweepResult,
} from "@aramayo/domain";

export interface PublicationOperationalAlertServiceOptions {
  readonly now?: () => Date;
}

export class PublicationOperationalAlertService {
  readonly #now: () => Date;
  readonly #repository: PublicationOperationalAlertRepository;

  constructor(
    repository: PublicationOperationalAlertRepository,
    options: PublicationOperationalAlertServiceOptions = {},
  ) {
    this.#now = options.now ?? ((): Date => new Date());
    this.#repository = repository;
  }

  sweep(): Promise<PublicationOperationalAlertSweepResult> {
    return this.#repository.sweep({
      at: this.#now().toISOString(),
      limit: publicationOperationalAlertPolicy.sweepLimit,
      nearPublicationWindowMilliseconds:
        publicationOperationalAlertPolicy.nearPublicationWindowMilliseconds,
      occurrenceStuckThresholdMilliseconds:
        publicationOperationalAlertPolicy.occurrenceStuckThresholdMilliseconds,
    });
  }
}
