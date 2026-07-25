import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { canonicalEntries, nonCanonicalPaths } from "./source-map.ts";

export interface FileDigest {
  readonly bytes: number;
  readonly path: string;
  readonly responsibility: string;
  readonly sha256: string;
}

export type TreeState = "clean" | "dirty";

export interface SourceSnapshot {
  readonly canonicalFiles: readonly FileDigest[];
  readonly commit: string;
  readonly commitDate: string;
  readonly dirtyPaths: readonly string[];
  readonly nonCanonicalPaths: readonly CanonicalClassification[];
  readonly remote: string;
  readonly repository: string;
  readonly treeState: TreeState;
}

export interface CanonicalClassification {
  readonly exists: boolean;
  readonly path: string;
  readonly responsibility: string;
}

/**
 * Ejecuta git en modo lectura sobre el checkout fuente.
 *
 * El repositorio anterior nunca se modifica: sólo se consultan metadatos.
 */
function readGit(
  sourceDirectory: string,
  gitArguments: readonly string[],
): string {
  const result = spawnSync("git", ["-C", sourceDirectory, ...gitArguments], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      `No se pudo leer el checkout fuente (git ${gitArguments.join(" ")}): ${result.stderr.trim()}`,
    );
  }

  return result.stdout.trim();
}

export function parseDirtyPaths(porcelainOutput: string): readonly string[] {
  return Object.freeze(
    porcelainOutput
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.slice(3).trim())
      .map((path) => (path.startsWith('"') ? path.slice(1, -1) : path))
      .sort((left, right) => left.localeCompare(right)),
  );
}

async function digestFile(
  sourceDirectory: string,
  entry: { readonly path: string; readonly responsibility: string },
): Promise<FileDigest> {
  const absolutePath = join(sourceDirectory, entry.path);
  const content = await readFile(absolutePath);

  return Object.freeze({
    bytes: content.byteLength,
    path: entry.path,
    responsibility: entry.responsibility,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica que cada entrada del mapa de origen exista en el checkout fuente.
 * Una entrada ausente detiene el congelamiento: el mapa y el repositorio
 * tienen que describir la misma realidad.
 */
export async function verifySourceMap(sourceDirectory: string): Promise<void> {
  const missingEntries: string[] = [];

  for (const entry of canonicalEntries) {
    if (!(await pathExists(join(sourceDirectory, entry.path)))) {
      missingEntries.push(entry.path);
    }
  }

  if (missingEntries.length > 0) {
    throw new Error(
      `El mapa de origen no coincide con el checkout fuente. Faltan: ${missingEntries.join(", ")}.`,
    );
  }
}

export async function readSourceSnapshot(
  sourceDirectory: string,
): Promise<SourceSnapshot> {
  await verifySourceMap(sourceDirectory);

  const dirtyPaths = parseDirtyPaths(
    readGit(sourceDirectory, ["status", "--porcelain"]),
  );
  const canonicalFiles = await Promise.all(
    canonicalEntries.map((entry) => digestFile(sourceDirectory, entry)),
  );
  const classifications: CanonicalClassification[] = [];

  for (const entry of nonCanonicalPaths) {
    classifications.push(
      Object.freeze({
        exists: await pathExists(join(sourceDirectory, entry.path)),
        path: entry.path,
        responsibility: entry.responsibility,
      }),
    );
  }

  return Object.freeze({
    canonicalFiles: Object.freeze(canonicalFiles),
    commit: readGit(sourceDirectory, ["rev-parse", "HEAD"]),
    commitDate: readGit(sourceDirectory, ["log", "-1", "--format=%cI"]),
    dirtyPaths,
    nonCanonicalPaths: Object.freeze(classifications),
    remote: readGit(sourceDirectory, ["remote", "get-url", "origin"]),
    repository: basename(sourceDirectory),
    treeState: dirtyPaths.length === 0 ? "clean" : "dirty",
  });
}
