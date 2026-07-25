import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PngDimensions {
  readonly height: number;
  readonly width: number;
}

export interface ReferenceMetadata {
  readonly bytes: number;
  readonly exportCommand: string;
  readonly exportedAt: string;
  readonly fixtureId: string;
  readonly height: number;
  readonly path: string;
  readonly sha256: string;
  readonly width: number;
}

export const exportCommand = "EXPORT_SCALE=1 npm run export";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Lee ancho y alto desde la cabecera IHDR.
 *
 * Evita agregar una dependencia de imágenes para una comprobación que el
 * formato PNG ya expone en sus primeros 24 bytes.
 */
export function readPngDimensions(content: Buffer): PngDimensions {
  if (content.byteLength < 24 || !content.subarray(0, 8).equals(pngSignature)) {
    throw new Error("El archivo no es un PNG válido.");
  }

  return Object.freeze({
    height: content.readUInt32BE(20),
    width: content.readUInt32BE(16),
  });
}

function run(
  command: string,
  commandArguments: readonly string[],
  options: {
    readonly environment?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
    readonly workingDirectory?: string;
  } = {},
): void {
  const result = spawnSync(command, [...commandArguments], {
    cwd: options.workingDirectory ?? process.cwd(),
    encoding: "utf8",
    env: options.environment ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? 600_000,
  });

  if (result.status !== 0) {
    throw new Error(
      `Falló "${command} ${commandArguments.join(" ")}":\n${result.stderr || result.stdout}`,
    );
  }
}

/**
 * Copia el checkout fuente a un directorio de trabajo descartable.
 *
 * La exportación escribe en `output/`, `public/media/brand/` y cachés de Vite;
 * ejecutarla sobre el repositorio original lo modificaría. La copia garantiza
 * que el generador quede exactamente como estaba.
 */
export function createIsolatedCopy(
  sourceDirectory: string,
  workDirectory: string,
): void {
  // Las exclusiones se anclan a la raíz de la transferencia: `dist/` sin anclar
  // también descartaría `node_modules/**/dist`, que sí hace falta para exportar.
  run("rsync", [
    "--archive",
    "--delete",
    "--exclude",
    "/.git/",
    "--exclude",
    "/output/",
    "--exclude",
    "/dist/",
    `${sourceDirectory}/`,
    `${workDirectory}/`,
  ]);
}

export interface FixtureFile {
  readonly content: string;
  readonly id: string;
}

/**
 * Deja en la copia únicamente las piezas congeladas: la exportación produce
 * exactamente las referencias de la línea base y nada más.
 */
export async function replaceFixtures(
  workDirectory: string,
  fixtures: readonly FixtureFile[],
): Promise<void> {
  const postsDirectory = join(workDirectory, "posts");
  await rm(postsDirectory, { force: true, recursive: true });

  const baselineDirectory = join(postsDirectory, "baseline");
  await mkdir(baselineDirectory, { recursive: true });

  for (const fixture of fixtures) {
    await writeFile(
      join(baselineDirectory, `${fixture.id}.md`),
      fixture.content,
      "utf8",
    );
  }
}

export function runExport(workDirectory: string): void {
  run("npm", ["run", "export"], {
    environment: { ...process.env, EXPORT_SCALE: "1" },
    workingDirectory: workDirectory,
  });
}

async function findExportedPng(
  outputDirectory: string,
  fixtureId: string,
): Promise<string> {
  const entries = await readdir(outputDirectory, {
    recursive: true,
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.isFile() && entry.name === `${fixtureId}.png`) {
      return join(entry.parentPath, entry.name);
    }
  }

  throw new Error(`La exportación no produjo ${fixtureId}.png.`);
}

export async function collectReference(
  workDirectory: string,
  referencesDirectory: string,
  fixtureId: string,
): Promise<ReferenceMetadata> {
  const exportedPath = await findExportedPng(
    join(workDirectory, "output"),
    fixtureId,
  );
  const content = await readFile(exportedPath);
  const dimensions = readPngDimensions(content);
  const referenceName = `${fixtureId}.png`;

  await writeFile(join(referencesDirectory, referenceName), content);

  return Object.freeze({
    bytes: content.byteLength,
    exportCommand,
    exportedAt: new Date().toISOString(),
    fixtureId,
    height: dimensions.height,
    path: `references/${referenceName}`,
    sha256: createHash("sha256").update(content).digest("hex"),
    width: dimensions.width,
  });
}
