import type { AssetEntry, FontEntry, FormatEntry } from "./inventory.ts";
import type { ReferenceMetadata } from "./references.ts";
import type { SourceSnapshot } from "./snapshot.ts";

export interface FixtureRecord {
  readonly basedOn: string;
  readonly bytes: number;
  readonly categoria: string | undefined;
  readonly coverage: string;
  readonly id: string;
  readonly layout: string | undefined;
  readonly origin: "derivado" | "generador";
  readonly path: string;
  readonly sha256: string;
  readonly size: string | undefined;
  readonly theme: string | undefined;
}

export interface BaselineInventory {
  readonly assets: readonly AssetEntry[];
  readonly layoutsWithoutFixture: readonly string[];
  readonly fonts: readonly FontEntry[];
  readonly formats: readonly FormatEntry[];
  readonly iconLibrary: string;
  readonly iconNames: readonly string[];
  readonly layouts: readonly string[];
  readonly themes: readonly string[];
}

export interface BaselineManifest {
  readonly fixtures: readonly FixtureRecord[];
  readonly frozenAt: string;
  readonly inventory: BaselineInventory;
  readonly references: readonly ReferenceMetadata[];
  readonly source: SourceSnapshot;
  readonly task: string;
}

export function serializeManifest(manifest: BaselineManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function describeAssets(assets: readonly AssetEntry[]): string {
  const brandAssets = assets.filter((asset) => asset.kind === "brand");
  const mediaAssets = assets.filter((asset) => asset.kind === "media");

  return [
    `- Activos de marca (\`public/media/brand\`): ${brandAssets.length}.`,
    `- Fotografías y recursos (\`public/media\`): ${mediaAssets.length}.`,
  ].join("\n");
}

function describeOwnership(assets: readonly AssetEntry[]): string {
  const statuses = new Map<string, { count: number; note: string }>();

  for (const asset of assets) {
    const current = statuses.get(asset.ownership);
    statuses.set(asset.ownership, {
      count: (current?.count ?? 0) + 1,
      note: asset.ownershipNote,
    });
  }

  const summary = [...statuses.entries()]
    .map(
      ([status, { count, note }]) => `| \`${status}\` | ${count} | ${note} |`,
    )
    .join("\n");

  const pending = assets.filter((asset) =>
    asset.ownership.startsWith("por-confirmar"),
  );

  const pendingList =
    pending.length === 0
      ? "\nNo quedan activos pendientes de confirmación.\n"
      : `\nRequieren confirmación del negocio antes de migrarse en \`P1-T03\`:\n\n${pending
          .map((asset) => `- \`${asset.path}\``)
          .join("\n")}\n`;

  return `| Estado | Activos | Criterio |
|---|---:|---|
${summary}
${pendingList}`;
}

/**
 * Documento legible del inventario.
 *
 * El manifiesto JSON es la evidencia exacta; este archivo existe para la
 * revisión manual de cobertura que exige la tarea.
 */
export function renderInventoryDocument(manifest: BaselineManifest): string {
  const { inventory, source } = manifest;

  return `# Inventario de la línea base visual

Generado por \`pnpm baseline:freeze\` el ${manifest.frozenAt}.
Tarea: ${manifest.task}.

No editar a mano: se regenera desde el checkout fuente.

## Origen

| Dato | Valor |
|---|---|
| Repositorio | \`${source.repository}\` |
| Remoto | \`${source.remote}\` |
| Commit | \`${source.commit}\` |
| Fecha del commit | ${source.commitDate} |
| Estado del árbol | ${source.treeState === "clean" ? "limpio" : `con ${source.dirtyPaths.length} rutas sin commitear`} |

Los archivos canónicos quedaron fijados por hash en \`manifest.json\`; esa lista
es la referencia cuando el árbol fuente no está limpio.

## Cobertura

- Layouts registrados: ${inventory.layouts.length}.
- Formatos: ${inventory.formats.length}.
- Temas: ${inventory.themes.length}.
- Familias tipográficas: ${inventory.fonts.length}.
- Nombres semánticos de icono: ${inventory.iconNames.length} (\`${inventory.iconLibrary}\`).
- Fixtures congelados: ${manifest.fixtures.length}.
- Referencias PNG: ${manifest.references.length}.

${describeAssets(inventory.assets)}

## Propiedad y permiso de uso de los activos

${describeOwnership(inventory.assets)}
## Tipografías e iconos

${inventory.fonts.map((font) => `- \`${font.package}@${font.version}\` (familia \`${font.family}\`)`).join("\n")}
- Iconos: \`${inventory.iconLibrary}\`, referenciados por nombre semántico.

## Formatos

| Formato | Etiqueta | Tamaño | Zona segura |
|---|---|---|---|
${inventory.formats
  .map(
    (format) =>
      `| \`${format.id}\` | ${format.label} | ${format.width}×${format.height} | \`${format.safeArea}\` |`,
  )
  .join("\n")}

## Temas

${inventory.themes.map((theme) => `- \`${theme}\``).join("\n")}

## Layouts

${inventory.layouts.map((layout) => `- \`${layout}\``).join("\n")}

## Fixtures y referencias

| Fixture | Origen | Layout | Tamaño | Cobertura |
|---|---|---|---|---|
${manifest.fixtures
  .map(
    (fixture) =>
      `| \`${fixture.id}\` | ${fixture.origin === "generador" ? `\`${fixture.basedOn}\`` : `derivado de \`${fixture.basedOn}\``} | \`${fixture.layout ?? "sin declarar"}\` | ${fixture.size ?? "sin declarar"} | ${fixture.coverage} |`,
  )
  .join("\n")}

## Layouts registrados sin pieza en el generador

${
  inventory.layoutsWithoutFixture.length === 0
    ? "Todos los layouts registrados tienen al menos un fixture."
    : `Estos layouts existen en el registro pero ninguna pieza los usa, así que su fixture debe crearse al migrarlos en \`P1-T04\`:\n\n${inventory.layoutsWithoutFixture
        .map((layout) => `- \`${layout}\``)
        .join("\n")}`
}

## Rutas no canónicas

${source.nonCanonicalPaths
  .map(
    (entry) =>
      `- \`${entry.path}\`${entry.exists ? "" : " (ausente)"}: ${entry.responsibility}.`,
  )
  .join("\n")}
`;
}
