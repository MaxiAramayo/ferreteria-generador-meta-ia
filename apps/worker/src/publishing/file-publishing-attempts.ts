/**
 * Diario de intentos sobre un archivo.
 *
 * Existe para el smoke de publicación real y no para producción: el diario de
 * verdad se persiste en PostgreSQL dentro del modelo de orden, destino e intento
 * de `P5-T05`. Lo que sí conserva de aquel es lo único que hace falta para que
 * el smoke pruebe algo: la escritura sólo se acepta si continúa a la última
 * almacenada, y el archivo sobrevive al proceso.
 *
 * Esa durabilidad es el punto. Sin ella, repetir el comando no encontraría el
 * intento anterior y publicaría por segunda vez en una cuenta real, que es
 * exactamente lo que la vertical viene a impedir.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs";

import type {
  MetaPublishingAttemptJournal,
  MetaPublishingAttemptRecord,
  MetaPublishingAttemptScope,
  MetaPublishingAttemptWriteResult,
} from "@aramayo/domain";

function keyOf(scope: MetaPublishingAttemptScope): string {
  return `${scope.organizationId}::${scope.publicationTargetId}`;
}

export class FileMetaPublishingAttemptJournal implements MetaPublishingAttemptJournal {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  get records(): readonly MetaPublishingAttemptRecord[] {
    return [...this.#read().values()];
  }

  find(
    scope: MetaPublishingAttemptScope,
  ): Promise<MetaPublishingAttemptRecord | null> {
    return Promise.resolve(this.#read().get(keyOf(scope)) ?? null);
  }

  save(
    record: MetaPublishingAttemptRecord,
  ): Promise<MetaPublishingAttemptWriteResult> {
    const attempts = this.#read();
    const stored = attempts.get(keyOf(record));
    if (record.sequence !== (stored?.sequence ?? 0) + 1) {
      return Promise.resolve("conflict");
    }
    attempts.set(keyOf(record), record);
    // Escritura y renombre: un corte a mitad de camino deja el archivo anterior
    // entero en vez de uno truncado que no se puede leer.
    const temporaryPath = `${this.#path}.tmp`;
    writeFileSync(
      temporaryPath,
      `${JSON.stringify([...attempts.values()], null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    renameSync(temporaryPath, this.#path);
    return Promise.resolve("saved");
  }

  #read(): Map<string, MetaPublishingAttemptRecord> {
    let contents: string;
    try {
      contents = readFileSync(this.#path, "utf8");
    } catch {
      return new Map();
    }
    const parsed: unknown = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      throw new Error("El diario de intentos no contiene una lista.");
    }
    const attempts = new Map<string, MetaPublishingAttemptRecord>();
    for (const entry of parsed) {
      const record = entry as MetaPublishingAttemptRecord;
      attempts.set(keyOf(record), record);
    }
    return attempts;
  }
}
