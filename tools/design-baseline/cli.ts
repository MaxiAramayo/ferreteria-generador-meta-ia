import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ownershipFor } from "./asset-ownership.ts";
import {
  derivedFixtures,
  selectFixturesFromPosts,
  type PostFile,
} from "./fixtures.ts";
import { parseSize, readFixtureMetadata } from "./frontmatter.ts";
import {
  extractFonts,
  extractFormats,
  extractIconLibrary,
  extractIconNames,
  extractLayoutIds,
  extractThemeIds,
  type AssetEntry,
} from "./inventory.ts";
import {
  renderInventoryDocument,
  serializeManifest,
  type BaselineManifest,
  type FixtureRecord,
} from "./manifest.ts";
import {
  collectReference,
  createIsolatedCopy,
  exportCommand,
  readPngDimensions,
  replaceFixtures,
  runExport,
  type ReferenceMetadata,
} from "./references.ts";
import { readSourceSnapshot } from "./snapshot.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const baselineDirectory = join(
  repositoryDirectory,
  "packages",
  "design-engine",
  "baseline",
);
const fixturesDirectory = join(baselineDirectory, "fixtures");
const referencesDirectory = join(baselineDirectory, "references");
const manifestPath = join(baselineDirectory, "manifest.json");
const inventoryPath = join(baselineDirectory, "INVENTORY.md");
const defaultSourceDirectory = join(
  repositoryDirectory,
  "..",
  "ferreteria-aramayo-image-generator",
);
const taskId = "P1-T01";

function digest(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function readSourceOption(commandArguments: readonly string[]): string {
  const flagIndex = commandArguments.indexOf("--source");
  if (flagIndex === -1) {
    return defaultSourceDirectory;
  }

  const value = commandArguments[flagIndex + 1];
  if (value === undefined) {
    throw new Error("--source requiere una ruta al checkout del generador.");
  }

  return value;
}

async function readAssets(
  sourceDirectory: string,
): Promise<readonly AssetEntry[]> {
  const mediaDirectory = join(sourceDirectory, "public", "media");
  const entries = await readdir(mediaDirectory, {
    recursive: true,
    withFileTypes: true,
  });
  const assets: AssetEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = join(entry.parentPath, entry.name);
    const content = await readFile(absolutePath);
    const relativePath = relative(sourceDirectory, absolutePath);

    const ownership = ownershipFor(relativePath);

    assets.push(
      Object.freeze({
        bytes: content.byteLength,
        kind: relativePath.includes("/brand/") ? "brand" : "media",
        ownership: ownership.status,
        ownershipNote: ownership.note,
        path: relativePath,
        sha256: digest(content),
      }),
    );
  }

  return Object.freeze(
    assets.sort((left, right) => left.path.localeCompare(right.path)),
  );
}

/** Lee todas las piezas del generador para elegir la cobertura por layout. */
async function readPostFiles(
  sourceDirectory: string,
): Promise<readonly PostFile[]> {
  const postsDirectory = join(sourceDirectory, "posts");
  const entries = await readdir(postsDirectory, {
    recursive: true,
    withFileTypes: true,
  });
  const postFiles: PostFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const absolutePath = join(entry.parentPath, entry.name);
    postFiles.push({
      content: await readFile(absolutePath, "utf8"),
      path: relative(sourceDirectory, absolutePath),
    });
  }

  return Object.freeze(postFiles);
}

async function freezeFixtures(
  sourceDirectory: string,
): Promise<readonly FixtureRecord[]> {
  const records: FixtureRecord[] = [];
  const selectedFixtures = selectFixturesFromPosts(
    await readPostFiles(sourceDirectory),
  );

  for (const fixture of selectedFixtures) {
    const { content } = fixture;
    const metadata = readFixtureMetadata(content);
    await writeFile(
      join(fixturesDirectory, `${fixture.id}.md`),
      content,
      "utf8",
    );

    records.push(
      Object.freeze({
        basedOn: fixture.sourcePath,
        bytes: Buffer.byteLength(content, "utf8"),
        categoria: metadata.categoria,
        coverage: fixture.coverage,
        id: fixture.id,
        layout: metadata.layout,
        origin: "generador",
        path: `fixtures/${fixture.id}.md`,
        sha256: digest(content),
        size: metadata.size,
        theme: metadata.theme,
      }),
    );
  }

  for (const fixture of derivedFixtures) {
    const metadata = readFixtureMetadata(fixture.content);
    await writeFile(
      join(fixturesDirectory, `${fixture.id}.md`),
      fixture.content,
      "utf8",
    );

    records.push(
      Object.freeze({
        basedOn: fixture.basedOn,
        bytes: Buffer.byteLength(fixture.content, "utf8"),
        categoria: metadata.categoria,
        coverage: fixture.coverage,
        id: fixture.id,
        layout: metadata.layout,
        origin: "derivado",
        path: `fixtures/${fixture.id}.md`,
        sha256: digest(fixture.content),
        size: metadata.size,
        theme: metadata.theme,
      }),
    );
  }

  return Object.freeze(records);
}

async function exportReferences(
  sourceDirectory: string,
  fixtures: readonly FixtureRecord[],
): Promise<readonly ReferenceMetadata[]> {
  const workDirectory = await mkdtemp(join(tmpdir(), "aramayo-baseline-"));
  const references: ReferenceMetadata[] = [];

  try {
    process.stdout.write(
      `Copiando el generador a un directorio descartable (${workDirectory}).\n`,
    );
    createIsolatedCopy(sourceDirectory, workDirectory);

    const fixtureFiles = await Promise.all(
      fixtures.map(async (fixture) => ({
        content: await readFile(
          join(fixturesDirectory, `${fixture.id}.md`),
          "utf8",
        ),
        id: fixture.id,
      })),
    );
    await replaceFixtures(workDirectory, fixtureFiles);

    process.stdout.write(`Exportando referencias con "${exportCommand}".\n`);
    runExport(workDirectory);

    for (const fixture of fixtures) {
      references.push(
        await collectReference(workDirectory, referencesDirectory, fixture.id),
      );
    }
  } finally {
    await rm(workDirectory, { force: true, recursive: true });
  }

  return Object.freeze(references);
}

async function freeze(commandArguments: readonly string[]): Promise<void> {
  const sourceDirectory = readSourceOption(commandArguments);
  const snapshot = await readSourceSnapshot(sourceDirectory);

  process.stdout.write(
    `Congelando ${snapshot.repository} en ${snapshot.commit.slice(0, 12)} (árbol ${snapshot.treeState}).\n`,
  );

  const [layoutsSource, themeSource, formatsSource, packageJson, iconSource] =
    await Promise.all([
      readFile(join(sourceDirectory, "src/layouts/index.tsx"), "utf8"),
      readFile(join(sourceDirectory, "src/theme.ts"), "utf8"),
      readFile(join(sourceDirectory, "src/formats.ts"), "utf8"),
      readFile(join(sourceDirectory, "package.json"), "utf8"),
      readFile(join(sourceDirectory, "src/components/Icon.tsx"), "utf8"),
    ]);

  // El inventario se extrae antes de exportar: una lectura fallida debe
  // detener el congelamiento en segundos, no después de renderizar.
  const inventory = {
    assets: await readAssets(sourceDirectory),
    layoutsWithoutFixture: [] as readonly string[],
    fonts: extractFonts(packageJson),
    formats: extractFormats(formatsSource),
    iconLibrary: extractIconLibrary(packageJson),
    iconNames: extractIconNames(iconSource),
    layouts: extractLayoutIds(layoutsSource),
    themes: extractThemeIds(themeSource),
  };
  process.stdout.write(
    `Inventario leído: ${inventory.layouts.length} layouts, ${inventory.formats.length} formatos, ${inventory.themes.length} temas.\n`,
  );

  await rm(fixturesDirectory, { force: true, recursive: true });
  await rm(referencesDirectory, { force: true, recursive: true });
  await mkdir(fixturesDirectory, { recursive: true });
  await mkdir(referencesDirectory, { recursive: true });

  const fixtures = await freezeFixtures(sourceDirectory);
  const references = await exportReferences(sourceDirectory, fixtures);

  const coveredLayouts = new Set(fixtures.map((fixture) => fixture.layout));
  const manifest: BaselineManifest = {
    fixtures,
    frozenAt: new Date().toISOString(),
    inventory: {
      ...inventory,
      layoutsWithoutFixture: Object.freeze(
        inventory.layouts.filter((layout) => !coveredLayouts.has(layout)),
      ),
    },
    references,
    source: snapshot,
    task: taskId,
  };

  await writeFile(manifestPath, serializeManifest(manifest), "utf8");
  await writeFile(inventoryPath, renderInventoryDocument(manifest), "utf8");

  process.stdout.write(
    `Línea base congelada: ${manifest.inventory.layouts.length} layouts, ${fixtures.length} fixtures y ${references.length} referencias.\n`,
  );
}

/**
 * Comprueba la línea base sin necesitar el checkout fuente.
 *
 * Reconstruye los hashes de fixtures y referencias y confirma que cada PNG
 * tenga las dimensiones declaradas por el formato de su pieza.
 */
async function verify(): Promise<void> {
  const manifestContent = await readFile(manifestPath, "utf8").catch(() => {
    throw new Error(
      'No existe la línea base. Ejecutar "pnpm baseline:freeze" con el generador disponible.',
    );
  });
  const manifest: unknown = JSON.parse(manifestContent);

  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("El manifiesto de la línea base es inválido.");
  }

  const { fixtures, references } = manifest as BaselineManifest;
  const problems: string[] = [];

  for (const fixture of fixtures) {
    const content = await readFile(
      join(baselineDirectory, fixture.path),
      "utf8",
    );
    if (digest(content) !== fixture.sha256) {
      problems.push(
        `${fixture.id}: el fixture cambió respecto del manifiesto.`,
      );
    }
  }

  for (const reference of references) {
    const content = await readFile(join(baselineDirectory, reference.path));
    if (digest(content) !== reference.sha256) {
      problems.push(
        `${reference.fixtureId}: la referencia cambió respecto del manifiesto.`,
      );
      continue;
    }

    const dimensions = readPngDimensions(content);
    const fixture = fixtures.find(
      (candidate) => candidate.id === reference.fixtureId,
    );
    const declaredSize = fixture?.size;

    if (declaredSize === undefined) {
      problems.push(`${reference.fixtureId}: la pieza no declara tamaño.`);
      continue;
    }

    const expected = parseSize(declaredSize);
    if (
      dimensions.width !== expected.width ||
      dimensions.height !== expected.height
    ) {
      problems.push(
        `${reference.fixtureId}: la referencia mide ${dimensions.width}×${dimensions.height} y el formato declara ${expected.width}×${expected.height}.`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Línea base inconsistente:\n- ${problems.join("\n- ")}`);
  }

  process.stdout.write(
    `Línea base verificada: ${fixtures.length} fixtures y ${references.length} referencias con hash y dimensiones correctas.\n`,
  );
}

try {
  const command = process.argv[2];
  const commandArguments = process.argv.slice(3);

  if (command === "freeze") {
    await freeze(commandArguments);
  } else if (command === "verify") {
    await verify();
  } else {
    throw new Error("Comando inválido. Usá freeze o verify.");
  }
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Línea base visual: ${message}\n`);
  process.exitCode = 1;
}
