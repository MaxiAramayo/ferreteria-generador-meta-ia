/**
 * Regresión visual de las piezas aprobadas (`P7-T02`).
 *
 * Renderiza cada caso de `visual-regression-cases.ts` por el mismo camino que
 * el worker —documento completo por `file://`, fuentes y activos locales,
 * espera de fuentes e imágenes, recorte del nodo `[data-card]`— y compara el
 * inventario de lo que el navegador compuso contra la línea base versionada en
 * `visual-regression/`. Por qué se compara el inventario y no los píxeles está
 * en `render-inventory.ts`.
 *
 * ```bash
 * pnpm visual:regression              # compara; falla con el detalle por pieza
 * pnpm visual:regression -- --update  # reescribe la línea base
 * ```
 *
 * Reescribir la línea base es una decisión de diseño, no un trámite: el diff de
 * esos archivos es lo que se revisa en el PR. Por eso `--update` renderiza cada
 * pieza dos veces y no escribe una pieza cuyos dos renders difieran.
 *
 * Una diferencia deja en `output/visual-regression/` el PNG de cada pieza que
 * cambió, su inventario actual y el informe: es la evidencia que conserva CI.
 * El navegador es el Chrome del sistema, o el que indique
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, igual que en el worker.
 */

import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import { FORMATS, type DesignDocument } from "@aramayo/design-engine";
import { chromium, type Browser } from "playwright-core";

import { renderBrowserLaunchOptions } from "../rendering/playwright-renderer.ts";
import {
  buildRenderHtml,
  renderContextFor,
  waitForRenderAssets,
} from "../rendering/render-document.ts";
import {
  compareRenderSnapshots,
  describeRenderInventory,
  parseRenderInventory,
  parseVisualBaseline,
  renderInventoryScript,
  serializeVisualBaseline,
  type RenderSnapshot,
} from "./render-inventory.ts";
import {
  visualRegressionCases,
  visualRegressionDocument,
  type VisualRegressionCase,
} from "./visual-regression-cases.ts";

const baselineDirectory = new URL("../../visual-regression/", import.meta.url);
const evidenceDirectory = new URL(
  "../../../../output/visual-regression/",
  import.meta.url,
);
const context = renderContextFor(ARAMAYO_BRAND_PROFILE);
const pageTimeoutMs = 30_000;
const differencesShownPerCase = 12;

interface RenderedCase {
  readonly png: Buffer;
  readonly snapshot: RenderSnapshot;
}

interface ChangedCase extends RenderedCase {
  readonly entry: VisualRegressionCase;
}

function chromiumExecutablePath(): string | undefined {
  const value = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]?.trim();

  if (value === undefined || value.length === 0) {
    return undefined;
  }
  if (!isAbsolute(value)) {
    throw new Error(
      "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH tiene que ser una ruta absoluta.",
    );
  }

  return value;
}

async function renderCase(
  browser: Browser,
  workingDirectory: string,
  entry: VisualRegressionCase,
  document: DesignDocument,
): Promise<RenderedCase> {
  const format = FORMATS[document.format];
  const documentPath = join(workingDirectory, `${entry.id}.html`);
  await writeFile(documentPath, buildRenderHtml({ context, document }), "utf8");

  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: format.height, width: format.width },
  });
  page.setDefaultTimeout(pageTimeoutMs);

  try {
    await page.goto(pathToFileURL(documentPath).href, { waitUntil: "load" });

    const broken: unknown = await page.evaluate(waitForRenderAssets);
    if (!Array.isArray(broken) || broken.length > 0) {
      throw new Error(
        `${entry.id}: una imagen de la pieza no decodificó; no hay render que comparar.`,
      );
    }

    const inventory = parseRenderInventory(
      await page.evaluate(renderInventoryScript),
    );
    const png = await page.locator("[data-card]").screenshot({ type: "png" });

    return { png, snapshot: describeRenderInventory(inventory) };
  } finally {
    await page.close();
  }
}

async function readBaseline(id: string): Promise<RenderSnapshot | null> {
  let raw: string;

  try {
    raw = await readFile(new URL(`${id}.json`, baselineDirectory), "utf8");
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return null;
    }
    throw cause;
  }

  const baseline = parseVisualBaseline(raw);
  if (baseline.id !== id) {
    throw new Error(
      `${id}.json declara otra pieza (${baseline.id}); la línea base está corrupta.`,
    );
  }

  return baseline.snapshot;
}

async function baselineIds(): Promise<readonly string[]> {
  let names: readonly string[];

  try {
    names = await readdir(baselineDirectory);
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return [];
    }
    throw cause;
  }

  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length));
}

function describeDifferences(
  title: string,
  differences: readonly string[],
): string {
  const shown = differences
    .slice(0, differencesShownPerCase)
    .map((difference) => `    ${difference}`);
  const hidden = differences.length - shown.length;

  return [
    `${title} (${differences.length} ${differences.length === 1 ? "diferencia" : "diferencias"}):`,
    ...shown,
    ...(hidden > 0 ? [`    … y ${hidden} más en su inventario.`] : []),
  ].join("\n");
}

function describeCoverage(cases: readonly VisualRegressionCase[]): string {
  const count = (kind: VisualRegressionCase["source"]["kind"]): number =>
    cases.filter((entry) => entry.source.kind === kind).length;

  return `${cases.length} piezas —${count("catalogo")} del catálogo, ${count("perfil")} de perfil, ${count("determinista")} deterministas y ${count("tema")} de tema—`;
}

/**
 * Evidencia de una corrida con diferencias: el PNG de cada pieza que cambió,
 * su inventario actual —que se compara con el versionado con un diff común— y
 * el informe. Las piezas usan contenido de muestra: no hay datos del negocio
 * ni secretos que proteger.
 */
async function writeEvidence(
  changed: readonly ChangedCase[],
  report: string,
): Promise<void> {
  await mkdir(evidenceDirectory, { recursive: true });

  for (const { entry, png, snapshot } of changed) {
    await writeFile(new URL(`${entry.id}.png`, evidenceDirectory), png);
    await writeFile(
      new URL(`${entry.id}.json`, evidenceDirectory),
      serializeVisualBaseline({ format: entry.format, id: entry.id, snapshot }),
      "utf8",
    );
  }

  await writeFile(new URL("informe.txt", evidenceDirectory), report, "utf8");
}

async function main(): Promise<void> {
  const update = process.argv.includes("--update");
  const cases = visualRegressionCases();
  const executablePath = chromiumExecutablePath();
  const startedAt = performance.now();
  const problems: string[] = [];
  const changed: ChangedCase[] = [];
  const rewritten: string[] = [];

  // La evidencia de una corrida anterior confundiría a quien mire esta.
  await rm(evidenceDirectory, { force: true, recursive: true });
  if (update) {
    await mkdir(baselineDirectory, { recursive: true });
  }

  const browser = await chromium.launch(
    renderBrowserLaunchOptions(
      executablePath === undefined ? {} : { executablePath },
    ),
  );
  const browserVersion = browser.version();
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "aramayo-regresion-visual-"),
  );

  try {
    for (const entry of cases) {
      const document = await visualRegressionDocument(entry);
      const rendered = await renderCase(
        browser,
        workingDirectory,
        entry,
        document,
      );
      const baseline = await readBaseline(entry.id);

      if (update) {
        const repeated = await renderCase(
          browser,
          workingDirectory,
          entry,
          document,
        );
        const drift = compareRenderSnapshots(
          rendered.snapshot,
          repeated.snapshot,
          0,
        );

        if (drift.length > 0) {
          problems.push(
            describeDifferences(
              `${entry.id}: dos renders de la misma pieza no coinciden`,
              drift,
            ),
          );
          continue;
        }

        if (
          baseline === null ||
          compareRenderSnapshots(baseline, rendered.snapshot, 0).length > 0
        ) {
          rewritten.push(entry.id);
        }

        await writeFile(
          new URL(`${entry.id}.json`, baselineDirectory),
          serializeVisualBaseline({
            format: entry.format,
            id: entry.id,
            snapshot: rendered.snapshot,
          }),
          "utf8",
        );
        continue;
      }

      if (baseline === null) {
        problems.push(
          `${entry.id}: no tiene línea base. Si la pieza es nueva, generala con pnpm visual:regression -- --update y revisá el resultado.`,
        );
        changed.push({ ...rendered, entry });
        continue;
      }

      const differences = compareRenderSnapshots(baseline, rendered.snapshot);
      if (differences.length > 0) {
        problems.push(describeDifferences(entry.id, differences));
        changed.push({ ...rendered, entry });
      }
    }

    const expected = new Set(cases.map((entry) => entry.id));
    for (const id of await baselineIds()) {
      if (expected.has(id)) {
        continue;
      }

      if (update) {
        await rm(new URL(`${id}.json`, baselineDirectory));
        rewritten.push(`${id} (retirada)`);
      } else {
        problems.push(
          `${id}: tiene línea base pero ya no está en el recorrido. Regenerá con pnpm visual:regression -- --update.`,
        );
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await rm(workingDirectory, { force: true, recursive: true }).catch(
      () => undefined,
    );
  }

  const seconds = Math.round((performance.now() - startedAt) / 1000);
  const coverage = describeCoverage(cases);

  if (problems.length > 0) {
    const report = [
      `Regresión visual con diferencias sobre ${coverage}, con ${browserVersion}:`,
      "",
      ...problems,
      "",
    ].join("\n");

    if (!update) {
      await writeEvidence(changed, report);
    }

    process.stderr.write(report);
    if (!update) {
      process.stderr.write(
        "Si el cambio es deliberado, regenerá con pnpm visual:regression -- --update y revisá el diff en el PR. La evidencia quedó en output/visual-regression/.\n",
      );
    }
    process.exitCode = 1;
    return;
  }

  if (update) {
    process.stdout.write(
      `Línea base visual reescrita: ${coverage}, con ${browserVersion} en ${seconds} s. ${rewritten.length === 0 ? "Ninguna cambió." : `Cambiaron ${rewritten.length}: ${rewritten.join(", ")}.`}\n`,
    );
    return;
  }

  process.stdout.write(
    `Regresión visual aprobada: ${coverage} iguales a la línea base, con ${browserVersion} en ${seconds} s.\n`,
  );
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Regresión visual fallida: ${message}\n`);
  process.exitCode = 1;
}
