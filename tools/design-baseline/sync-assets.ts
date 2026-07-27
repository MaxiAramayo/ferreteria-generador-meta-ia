import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copia al motor los activos aprobados de la línea base y genera su registro.
 *
 * El generador sigue siendo la fuente: este comando no inventa activos ni
 * cambia su contenido. Cada archivo se verifica contra el hash congelado en
 * `P1-T01` antes de copiarse, y el registro resultante permite comprobar la
 * integridad después, sin necesidad del checkout fuente.
 *
 * Uso:
 *
 * ```bash
 * pnpm assets:sync [ruta-al-generador]
 * ```
 */

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = join(
  repositoryDirectory,
  "packages/design-engine/baseline/manifest.json",
);
const assetsDirectory = join(
  repositoryDirectory,
  "packages/design-engine/assets",
);
const registryPath = join(
  repositoryDirectory,
  "packages/design-engine/src/assets/asset-library.ts",
);
const defaultSourceDirectory = join(
  repositoryDirectory,
  "../ferreteria-aramayo-image-generator",
);

interface BaselineAsset {
  readonly bytes: number;
  readonly kind: string;
  readonly ownership: string;
  readonly ownershipNote: string;
  readonly path: string;
  readonly sha256: string;
}

interface RegistryEntry {
  readonly assetId: string;
  readonly bytes: number;
  readonly file: string;
  readonly kind: "brand" | "media";
  readonly ownershipNote: string;
  readonly sha256: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} debe ser una cadena en el manifiesto.`);
  }
  return value;
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`${label} debe ser un número en el manifiesto.`);
  }
  return value;
}

async function readBaselineAssets(): Promise<readonly BaselineAsset[]> {
  const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!isRecord(parsed) || !isRecord(parsed["inventory"])) {
    throw new Error("El manifiesto de la línea base no tiene inventario.");
  }

  const assets = parsed["inventory"]["assets"];

  if (!isUnknownArray(assets)) {
    throw new Error("El inventario no declara una lista de activos.");
  }

  return assets.map((entry, index) => {
    const label = `inventory.assets[${String(index)}]`;

    if (!isRecord(entry)) {
      throw new Error(`${label} debe ser un objeto.`);
    }

    return {
      bytes: readNumber(entry["bytes"], `${label}.bytes`),
      kind: readText(entry["kind"], `${label}.kind`),
      ownership: readText(entry["ownership"], `${label}.ownership`),
      ownershipNote: readText(entry["ownershipNote"], `${label}.ownershipNote`),
      path: readText(entry["path"], `${label}.path`),
      sha256: readText(entry["sha256"], `${label}.sha256`),
    };
  });
}

function assetIdFor(assetPath: string): string {
  const relative = assetPath.replace(/^public\/media\//u, "");

  return relative.replace(/\.[a-z0-9]+$/iu, "").toLowerCase();
}

/**
 * Dos archivos pueden compartir nombre y diferir sólo en la extensión
 * (`manguera-azul.jpg` y `manguera-azul.jpeg`). En ese caso el identificador
 * incorpora la extensión: un activo nunca puede resolverse de dos maneras.
 */
function disambiguateIds(
  entries: readonly Omit<RegistryEntry, "assetId">[],
): readonly RegistryEntry[] {
  const occurrences = new Map<string, number>();

  for (const entry of entries) {
    const baseId = assetIdFor(`public/media/${entry.file}`);
    occurrences.set(baseId, (occurrences.get(baseId) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const baseId = assetIdFor(`public/media/${entry.file}`);
    const extension = entry.file.split(".").at(-1) ?? "";
    const isAmbiguous = (occurrences.get(baseId) ?? 0) > 1;

    return {
      ...entry,
      assetId: isAmbiguous ? `${baseId}-${extension.toLowerCase()}` : baseId,
    };
  });
}

function registryModule(entries: readonly RegistryEntry[]): string {
  const rows = entries
    .map(
      (entry) => `  Object.freeze({
    assetId: ${JSON.stringify(entry.assetId)},
    bytes: ${String(entry.bytes)},
    file: ${JSON.stringify(entry.file)},
    kind: ${JSON.stringify(entry.kind)},
    ownershipNote: ${JSON.stringify(entry.ownershipNote)},
    sha256: ${JSON.stringify(entry.sha256)},
  }),`,
    )
    .join("\n");

  return `/**
 * Biblioteca de activos aprobados.
 *
 * Generado por \`pnpm assets:sync\` desde la línea base congelada en \`P1-T01\`.
 * No editar a mano: cada entrada declara el archivo migrado, su tamaño, su hash
 * y la confirmación de propiedad del negocio.
 */

export interface BrandAsset {
  readonly assetId: string;
  readonly bytes: number;
  /** Ruta dentro de \`packages/design-engine/assets\`. */
  readonly file: string;
  readonly kind: "brand" | "media";
  readonly ownershipNote: string;
  readonly sha256: string;
}

export const BRAND_ASSETS: readonly BrandAsset[] = Object.freeze([
${rows}
]);
`;
}

async function main(): Promise<void> {
  const sourceDirectory = process.argv[2] ?? defaultSourceDirectory;
  const baselineAssets = await readBaselineAssets();
  const collected: Omit<RegistryEntry, "assetId">[] = [];

  for (const asset of baselineAssets) {
    if (asset.kind !== "brand" && asset.kind !== "media") {
      throw new Error(`Tipo de activo desconocido: ${asset.kind}.`);
    }
    if (asset.ownership !== "aramayo") {
      throw new Error(
        `El activo ${asset.path} no tiene propiedad confirmada; no se migra.`,
      );
    }

    const sourcePath = join(sourceDirectory, asset.path);
    const content = await readFile(sourcePath);
    const digest = createHash("sha256").update(content).digest("hex");

    if (digest !== asset.sha256) {
      throw new Error(
        `El activo ${asset.path} cambió respecto de la línea base congelada.`,
      );
    }

    const file = asset.path.replace(/^public\/media\//u, "");
    const destinationPath = join(assetsDirectory, file);

    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);

    collected.push({
      bytes: asset.bytes,
      file,
      kind: asset.kind,
      ownershipNote: asset.ownershipNote,
      sha256: asset.sha256,
    });
  }

  const entries = [...disambiguateIds(collected)].sort((first, second) =>
    first.assetId.localeCompare(second.assetId),
  );
  await writeFile(registryPath, registryModule(entries), "utf8");

  process.stdout.write(
    `Activos migrados: ${String(entries.length)} en packages/design-engine/assets.\n`,
  );
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Sincronización de activos fallida: ${message}\n`);
  process.exitCode = 1;
}
