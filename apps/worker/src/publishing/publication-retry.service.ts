/**
 * Planificación de reintentos.
 *
 * Decidir qué hacer con un fallo es un barrido aparte y no un paso del
 * publicador, y la razón es la que se ve cuando el worker se cae: el publicador
 * registra el fallo y ahí termina su responsabilidad, así que un plan que
 * viviera dentro de esa misma corrida se perdería con ella. Buscando después
 * los fallos que nadie planificó, la política sobrevive al reinicio.
 *
 * El servicio no publica ni consulta a Meta. Lee fallos, aplica la política y
 * escribe una fecha o un motivo. Toda la decisión vive en `planPublicationRetry`
 * y acá sólo se ejecuta, lo que deja el criterio comprobable sin infraestructura
 * y este archivo sin criterio propio.
 */

import {
  planPublicationRetry,
  type PublicationRetryRepository,
  type PublicationRetryTargetRecord,
} from "@aramayo/domain";

export interface PublicationRetryPlanningSummary {
  /** Fallos que quedaron esperando decisión humana. */
  readonly manual: number;
  readonly planned: number;
  /** Fallos que resultaron ambiguos y los resuelve la reconciliación. */
  readonly reconcilable: number;
  readonly reviewed: number;
  /** Planes que perdieron la carrera contra un publicador. */
  readonly skipped: number;
}

export interface PublicationRetryOptions {
  /** Sorteo del jitter. Se inyecta para que la prueba sea determinista. */
  readonly jitter?: () => number;
  readonly now?: () => Date;
}

export class PublicationRetryService {
  readonly #jitter: () => number;
  readonly #now: () => Date;
  readonly #retries: PublicationRetryRepository;

  constructor(
    retries: PublicationRetryRepository,
    options: PublicationRetryOptions = {},
  ) {
    this.#jitter = options.jitter ?? ((): number => Math.random());
    this.#now = options.now ?? ((): Date => new Date());
    this.#retries = retries;
  }

  async planBatch(limit: number): Promise<PublicationRetryPlanningSummary> {
    const failures = await this.#retries.unplannedFailures(limit);
    let manual = 0;
    let planned = 0;
    let reconcilable = 0;
    let skipped = 0;

    for (const target of failures) {
      const outcome = await this.#planOne(target);
      if (outcome === "manual") manual += 1;
      if (outcome === "planned") planned += 1;
      if (outcome === "reconcilable") reconcilable += 1;
      if (outcome === "skipped") skipped += 1;
    }

    return Object.freeze({
      manual,
      planned,
      reconcilable,
      reviewed: failures.length,
      skipped,
    });
  }

  async #planOne(
    target: PublicationRetryTargetRecord,
  ): Promise<"manual" | "planned" | "reconcilable" | "skipped"> {
    // Un fallo sin código no se puede clasificar. La base ya lo impide para el
    // estado `failed`, así que llegar acá sería una fila imposible.
    if (target.failureCode === undefined) return "skipped";

    const plan = planPublicationRetry({
      attempts: target.attempts,
      code: target.failureCode,
      jitter: this.#jitter(),
      now: this.#now().toISOString(),
    });
    const scope = {
      organizationId: target.organizationId,
      publicationTargetId: target.publicationTargetId,
      sequence: target.sequence,
    };

    switch (plan.status) {
      case "scheduled": {
        const written = await this.#retries.scheduleRetry({
          ...scope,
          nextAttemptAt: plan.nextAttemptAt,
        });
        return written === "saved" ? "planned" : "skipped";
      }
      case "manual": {
        const written = await this.#retries.requireManualAction({
          ...scope,
          reason: plan.reason,
        });
        return written === "saved" ? "manual" : "skipped";
      }
      case "reconcile":
        // No se toca: el barrido de reconciliación lo levanta por su código y
        // decidir acá exigiría publicar o abandonar sin haber preguntado.
        return "reconcilable";
    }
  }
}
