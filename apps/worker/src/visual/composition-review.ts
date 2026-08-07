/**
 * Suite visual de la composición.
 *
 * Compone cada pieza sobre cada fondo, la renderiza con un navegador real y
 * comprueba tres cosas que no se pueden afirmar leyendo el código:
 *
 * 1. **Nada de la capa determinista se sale del panel.** Si un titular largo
 *    empuja el llamado a la acción fuera de su caja, el texto termina apoyado
 *    en píxeles que decidió un modelo y el contraste deja de estar garantizado.
 * 2. **El contraste medido cumple el umbral.** No el contraste que deberían
 *    tener los tokens, sino el que tienen los píxeles exportados: se toma el
 *    color de fondo real debajo de cada texto y se compara con su color.
 * 3. **Volver a renderizar da el mismo PNG.** Cada caso se renderiza dos veces
 *    y los dos hashes tienen que coincidir.
 *
 * La salida queda en `composition-reference/`, con un manifiesto que registra
 * el hash de la base generada, el de la capa determinista y el de la pieza. Ese
 * manifiesto es la línea base: si un caso cambia de composición, el diff lo
 * muestra antes de que nadie mire una imagen.
 *
 * ```bash
 * pnpm composition:snapshot           # revisa y reescribe la línea base
 * pnpm composition:snapshot --check   # revisa sin reescribir
 * ```
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  contrastRatio,
  CONTRAST_THRESHOLDS,
  FORMATS,
} from "@aramayo/design-engine";
import { chromium, type Browser } from "playwright-core";
import sharp from "sharp";

import {
  buildRenderHtml,
  renderContextFor,
} from "../rendering/render-document.ts";
import {
  backgroundBytes,
  compositionBrief,
  compositionCases,
  sha256Of,
  type CompositionCase,
} from "./composition-snapshot-cases.ts";
import {
  composePiece,
  type ComposedBaseImage,
  type ComposedPiece,
} from "./piece-composer.ts";
import {
  measuredNodesScript,
  type MeasuredNode,
} from "./composition-geometry.ts";

const referenceDirectory = new URL(
  "../../composition-reference/",
  import.meta.url,
);
const manifestPath = fileURLToPath(
  new URL("manifest.json", referenceDirectory),
);
const context = renderContextFor(ARAMAYO_BRAND_PROFILE);

interface CaseReport {
  readonly baseSha256: string | null;
  readonly bytes: number;
  readonly compositionHash: string;
  readonly format: string;
  readonly height: number;
  readonly id: string;
  readonly layout: string;
  /** Peor contraste medido sobre los píxeles exportados. */
  readonly minimumContrast: number;
  readonly overlayHash: string;
  readonly sha256: string;
  readonly theme: string;
  readonly width: number;
}

/**
 * Color de fondo real debajo de un texto.
 *
 * Se toma el color más frecuente de su caja: los trazos de las letras ocupan
 * una minoría de los píxeles, así que la moda es el fondo sobre el que la
 * persona lee. Medir el promedio daría un color que no existe en la pieza.
 */
async function backdropUnder(png: Buffer, node: MeasuredNode): Promise<string> {
  // La caja se acota a la pieza antes de recortar: un elemento que se sale se
  // informa como hallazgo aparte, y acá lo que interesa es medir el contraste
  // de la parte que efectivamente se ve.
  const image = sharp(png);
  const metadata = await image.metadata();
  const canvasWidth = metadata.width;
  const canvasHeight = metadata.height;
  const left = Math.min(Math.max(0, Math.round(node.x)), canvasWidth - 1);
  const top = Math.min(Math.max(0, Math.round(node.y)), canvasHeight - 1);
  const width = Math.max(
    1,
    Math.min(Math.round(node.width), canvasWidth - left),
  );
  const height = Math.max(
    1,
    Math.min(Math.round(node.height), canvasHeight - top),
  );
  const region = await sharp(png)
    .extract({ height, left, top, width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map<number, number>();

  // El recorrido se detiene tres bytes antes del final, así que cada píxel
  // tiene sus tres canales completos.
  for (
    let index = 0;
    index + 2 < region.data.length;
    index += region.info.channels
  ) {
    const red = region.data[index] ?? 0;
    const green = region.data[index + 1] ?? 0;
    const blue = region.data[index + 2] ?? 0;
    const key = (red << 16) | (green << 8) | blue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let bestKey = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  return `#${bestKey.toString(16).padStart(6, "0")}`;
}

async function renderOnce(
  browser: Browser,
  piece: ComposedPiece,
): Promise<{ nodes: readonly MeasuredNode[]; png: Buffer }> {
  const format = FORMATS[piece.document.format];
  const page = await browser.newPage({
    viewport: { height: format.height, width: format.width },
  });

  try {
    await page.setContent(
      buildRenderHtml({ context, document: piece.document }),
      {
        waitUntil: "load",
      },
    );
    await page.evaluate("document.fonts.ready");

    const measured: unknown = await page.evaluate(measuredNodesScript);
    const png = await page.locator("[data-card]").screenshot({ type: "png" });

    return { nodes: measured as readonly MeasuredNode[], png };
  } finally {
    await page.close();
  }
}

async function reviewCase(
  browser: Browser,
  entry: CompositionCase,
  problems: string[],
): Promise<CaseReport> {
  const background = entry.background;
  let base: ComposedBaseImage | null = null;

  if (background !== null) {
    const bytes = await backgroundBytes(background);
    const metadata = await sharp(bytes).metadata();

    base = {
      bytes,
      height: metadata.height,
      mimeType: "image/png",
      sha256: sha256Of(bytes),
      width: metadata.width,
    };
  }

  const piece = composePiece({
    base,
    brief: compositionBrief,
    format: entry.format,
    region: entry.region,
    slug: `revision-${entry.id}`.slice(0, 64),
  });

  const first = await renderOnce(browser, piece);
  const second = await renderOnce(browser, piece);
  const sha256 = sha256Of(new Uint8Array(first.png));

  // Reproducibilidad: la misma composición tiene que dar el mismo PNG. Si no,
  // comparar contra una línea base no significaría nada.
  if (sha256 !== sha256Of(new Uint8Array(second.png))) {
    problems.push(`${entry.id}: dos renders de la misma pieza no coinciden.`);
  }

  const panel = first.nodes.find((node) => node.role === "panel");

  if (panel === undefined) {
    problems.push(`${entry.id}: la pieza no dibuja el panel de marca.`);
  }

  let minimumContrast = Number.POSITIVE_INFINITY;

  for (const node of first.nodes) {
    if (node.role === "panel") {
      continue;
    }

    // Todo lo determinista vive dentro del panel: es lo que permite afirmar el
    // contraste, porque el color de fondo lo elegimos nosotros.
    if (panel !== undefined && !containedIn(node, panel)) {
      problems.push(
        `${entry.id}: ${node.role} se sale del panel de marca y queda apoyado sobre la imagen generada.`,
      );
    }

    if (node.text.length === 0) {
      continue;
    }

    const backdrop = await backdropUnder(first.png, node);
    const measured = contrastRatio(node.color, backdrop);
    minimumContrast = Math.min(minimumContrast, measured);

    // El botón de acción usa el verde de WhatsApp, que es identidad aprobada en
    // `P1-T06` y mide 4,38:1. Se le exige el umbral de texto grande —es
    // tipografía grande en negrita— y al resto del copy, el de texto normal.
    const threshold =
      node.role === "cta"
        ? CONTRAST_THRESHOLDS.largeText
        : CONTRAST_THRESHOLDS.text;

    if (measured < threshold) {
      problems.push(
        `${entry.id}: ${node.role} mide ${measured.toFixed(2)}:1 sobre ${backdrop} y necesita ${String(threshold)}:1.`,
      );
    }
  }

  await writeFile(new URL(`${entry.id}.png`, referenceDirectory), first.png);

  return {
    baseSha256: piece.snapshot.baseSha256,
    bytes: first.png.byteLength,
    compositionHash: piece.snapshot.compositionHash,
    format: piece.snapshot.format,
    height: FORMATS[piece.document.format].height,
    id: entry.id,
    layout: piece.snapshot.layout,
    minimumContrast:
      minimumContrast === Number.POSITIVE_INFINITY
        ? 0
        : Math.round(minimumContrast * 100) / 100,
    overlayHash: piece.snapshot.overlayHash,
    sha256,
    theme: piece.snapshot.theme,
    width: FORMATS[piece.document.format].width,
  };
}

function containedIn(node: MeasuredNode, panel: MeasuredNode): boolean {
  const tolerance = 1;

  return (
    node.x >= panel.x - tolerance &&
    node.y >= panel.y - tolerance &&
    node.x + node.width <= panel.x + panel.width + tolerance &&
    node.y + node.height <= panel.y + panel.height + tolerance
  );
}

/**
 * Compara contra la línea base aprobada.
 *
 * Se comparan los hashes de composición y no los del PNG: el hash del PNG
 * depende de la versión del navegador, y `ADR-011` ya decidió que la línea base
 * es de identidad y calidad, no de paridad pixel a pixel. Lo que no puede
 * cambiar en silencio es **qué** se compone.
 */
async function readBaseline(): Promise<readonly CaseReport[] | null> {
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed: unknown = JSON.parse(raw);

    return (parsed as { cases?: readonly CaseReport[] }).cases ?? [];
  } catch {
    return null;
  }
}

function compareWithBaseline(
  previous: readonly CaseReport[] | null,
  reports: readonly CaseReport[],
  problems: string[],
): void {
  if (previous === null) {
    process.stdout.write(
      "composición: no hay línea base previa; esta corrida la establece.\n",
    );
    return;
  }

  const byId = new Map(previous.map((entry) => [entry.id, entry]));

  for (const report of reports) {
    const before = byId.get(report.id);

    if (before === undefined) {
      process.stdout.write(`composición: caso nuevo ${report.id}.\n`);
      continue;
    }

    if (before.compositionHash !== report.compositionHash) {
      problems.push(
        `${report.id}: la composición cambió respecto de la línea base aprobada.`,
      );
    }
    if (before.overlayHash !== report.overlayHash) {
      problems.push(
        `${report.id}: la capa determinista cambió respecto de la línea base aprobada.`,
      );
    }
  }
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const problems: string[] = [];
  const reports: CaseReport[] = [];

  // La línea base se lee **antes** de tocar el directorio: borrarlo primero
  // dejaría a la comparación sin nada contra qué comparar, y la revisión
  // aprobaría cualquier cambio sin decirlo.
  const baseline = await readBaseline();

  if (!check) {
    await rm(referenceDirectory, { force: true, recursive: true });
  }
  await mkdir(referenceDirectory, { recursive: true });

  try {
    for (const entry of compositionCases()) {
      reports.push(await reviewCase(browser, entry, problems));
    }
  } finally {
    await browser.close();
  }

  compareWithBaseline(baseline, reports, problems);

  if (problems.length > 0) {
    process.stderr.write(
      `Revisión de composición con hallazgos (${String(problems.length)}):\n`,
    );
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.exitCode = 1;
    return;
  }

  if (!check) {
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          approvedAt: new Date().toISOString(),
          cases: reports.sort((first, second) =>
            first.id.localeCompare(second.id),
          ),
          task: "P4-T05",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  const worst = reports.reduce(
    (lowest, report) => Math.min(lowest, report.minimumContrast),
    Number.POSITIVE_INFINITY,
  );

  process.stdout.write(
    `Composición aprobada: ${String(reports.length)} casos, peor contraste medido ${worst.toFixed(2)}:1.\n`,
  );
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Revisión de composición fallida: ${message}\n`);
  process.exitCode = 1;
}
