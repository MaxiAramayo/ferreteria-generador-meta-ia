import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SecretFinding {
  readonly forbiddenValue: string;
  readonly location: string;
}

/**
 * Busca coincidencias exactas de valores prohibidos.
 *
 * El resultado nunca incluye el valor completo: se informa un prefijo corto
 * para poder identificar la fuga sin volver a escribir el secreto en un log.
 */
export function findForbiddenValues(
  location: string,
  content: string,
  forbiddenValues: readonly string[],
): readonly SecretFinding[] {
  return forbiddenValues
    .filter((forbiddenValue) => content.includes(forbiddenValue))
    .map((forbiddenValue) => ({
      forbiddenValue: `${forbiddenValue.slice(0, 6)}…`,
      location,
    }));
}

export async function scanDirectory(
  directory: string,
  forbiddenValues: readonly string[],
): Promise<readonly SecretFinding[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  const findings: SecretFinding[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = join(entry.parentPath, entry.name);
    const content = await readFile(filePath, "utf8").catch(() => "");
    findings.push(
      ...findForbiddenValues(filePath, content, forbiddenValues),
    );
  }

  return findings;
}
