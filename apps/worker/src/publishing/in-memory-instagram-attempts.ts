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
  InstagramAttemptJournal,
  InstagramAttemptRecord,
  InstagramAttemptScope,
  InstagramAttemptWriteResult,
} from "@aramayo/domain";

function keyOf(scope: InstagramAttemptScope): string {
  return `${scope.organizationId}::${scope.publicationTargetId}`;
}

export class InMemoryInstagramAttemptJournal implements InstagramAttemptJournal {
  readonly #attempts = new Map<string, InstagramAttemptRecord>();

  get records(): readonly InstagramAttemptRecord[] {
    return [...this.#attempts.values()];
  }

  seed(record: InstagramAttemptRecord): void {
    this.#attempts.set(keyOf(record), record);
  }

  find(scope: InstagramAttemptScope): Promise<InstagramAttemptRecord | null> {
    return Promise.resolve(this.#attempts.get(keyOf(scope)) ?? null);
  }

  save(record: InstagramAttemptRecord): Promise<InstagramAttemptWriteResult> {
    const stored = this.#attempts.get(keyOf(record));
    if (record.sequence !== (stored?.sequence ?? 0) + 1) {
      return Promise.resolve("conflict");
    }
    this.#attempts.set(keyOf(record), record);
    return Promise.resolve("saved");
  }
}
