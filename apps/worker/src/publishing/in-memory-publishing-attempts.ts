/**
 * Diario de intentos de Instagram en memoria.
 *
 * Implementa el mismo contrato que tendrá el repositorio de producción, regla
 * de secuencia incluida, para que las pruebas no se apoyen en un doble más
 * permisivo que el sistema real. Es el mismo criterio que siguieron el
 * historial de briefs y el lote de generación.
 *
 * La regla que hay que respetar al persistirlo en `P5-T05`: una escritura solo
 * se acepta si continúa a la última almacenada. Es lo que impide que dos
 * trabajadores sobre el mismo destino se pisen y publiquen dos veces.
 */

import type {
  MetaPublishingAttemptJournal,
  MetaPublishingAttemptRecord,
  MetaPublishingAttemptScope,
  MetaPublishingAttemptWriteResult,
} from "@aramayo/domain";

function keyOf(scope: MetaPublishingAttemptScope): string {
  return `${scope.organizationId}::${scope.publicationTargetId}`;
}

export class InMemoryMetaPublishingAttemptJournal implements MetaPublishingAttemptJournal {
  readonly #attempts = new Map<string, MetaPublishingAttemptRecord>();

  get records(): readonly MetaPublishingAttemptRecord[] {
    return [...this.#attempts.values()];
  }

  seed(record: MetaPublishingAttemptRecord): void {
    this.#attempts.set(keyOf(record), record);
  }

  find(
    scope: MetaPublishingAttemptScope,
  ): Promise<MetaPublishingAttemptRecord | null> {
    return Promise.resolve(this.#attempts.get(keyOf(scope)) ?? null);
  }

  save(
    record: MetaPublishingAttemptRecord,
  ): Promise<MetaPublishingAttemptWriteResult> {
    const stored = this.#attempts.get(keyOf(record));
    if (record.sequence !== (stored?.sequence ?? 0) + 1) {
      return Promise.resolve("conflict");
    }
    this.#attempts.set(keyOf(record), record);
    return Promise.resolve("saved");
  }
}
