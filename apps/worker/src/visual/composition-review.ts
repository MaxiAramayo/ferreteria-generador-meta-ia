/**
 * Suite visual de la composición.
 *
 * Compone cada pieza sobre cada fondo, la renderiza con un navegador real y
 * comprueba tres cosas que no se pueden afirmar leyendo el código:
 *
 * 1. **Nada de la capa determinista se sale de su zona de marca.** Si un
 *    titular largo empuja el llamado a la acción fuera de su placa, velo o
 *    sello, el texto termina apoyado en píxeles que decidió un modelo y el
 *    contraste deja de estar garantizado.
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

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  contrastRatio,
  CONTRAST_THRESHOLDS,
  FORMATS,
  parseColor,
  relativeLuminance,
} from "@aramayo/design-engine";
import { chromium, type Browser } from "playwright-core";
import sharp from "sharp";

import { renderBrowserLaunchOptions } from "../rendering/playwright-renderer.ts";
import {
  buildRenderHtml,
  renderContextFor,
  waitForRenderAssets,
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
 * Color de fondo real debajo de un texto, en su caso más difícil.
 *
 * Se mide sobre la captura sin texto (`textlessStylesheet`), así que la caja de
 * un titular no cuenta los trazos de sus propias letras: en una condensada
 * pesada, ajustada al ancho de la palabra, las letras llegan a ocupar más
 * superficie que el fondo, y la moda devolvía el color de la letra. De los
 * píxeles del fondo se toma el percentil de luminancia más cercano a la letra
 * —el 95 para un texto claro, el 5 para uno oscuro—: sobre una placa es el
 * color de la placa, y sobre un velo encima de una foto es el tramo más difícil
 * de leer, sin que un puñado de píxeles sueltos decida el resultado. Se mide la
 * caja de contenido y no la caja entera: en un botón redondeado, las esquinas
 * que quedan afuera de la píldora muestran lo que hay detrás y no tocan ninguna
 * letra.
 */
async function backdropUnder(png: Buffer, node: MeasuredNode): Promise<string> {
  // La caja se acota a la pieza antes de recortar: un elemento que se sale se
  // informa como hallazgo aparte, y acá lo que interesa es medir el contraste
  // de la parte que efectivamente se ve.
  const image = sharp(png);
  const metadata = await image.metadata();
  const canvasWidth = metadata.width;
  const canvasHeight = metadata.height;
  const left = Math.min(
    Math.max(0, Math.round(node.contentX)),
    canvasWidth - 1,
  );
  const top = Math.min(
    Math.max(0, Math.round(node.contentY)),
    canvasHeight - 1,
  );
  const width = Math.max(
    1,
    Math.min(Math.round(node.contentWidth), canvasWidth - left),
  );
  const height = Math.max(
    1,
    Math.min(Math.round(node.contentHeight), canvasHeight - top),
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

  const colors = [...counts.entries()]
    .map(([key, count]) => ({
      count,
      key,
      luminance: relativeLuminance({
        alpha: 1,
        blue: key & 0xff,
        green: (key >> 8) & 0xff,
        red: (key >> 16) & 0xff,
      }),
    }))
    .sort((first, second) => first.luminance - second.luminance);
  const total = colors.reduce((sum, color) => sum + color.count, 0);

  const colorAt = (fraction: number): (typeof colors)[number] | undefined => {
    const target = fraction * (total - 1);
    let seen = 0;

    for (const color of colors) {
      seen += color.count;

      if (seen > target) {
        return color;
      }
    }

    return colors.at(-1);
  };

  const median = colorAt(0.5);
  const textIsLight =
    relativeLuminance(parseColor(node.color)) >= (median?.luminance ?? 0);
  const worst = colorAt(textIsLight ? 0.95 : 0.05);

  return `#${(worst?.key ?? 0).toString(16).padStart(6, "0")}`;
}

/**
 * Hoja que borra letras y dibujos y conserva todo lo demás.
 *
 * Con ella se toma la segunda captura: placas, velos, fotos y fondos de botón
 * quedan donde estaban, y lo único que falta es lo que se lee.
 */
const textlessStylesheet =
  "*{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;}svg{visibility:hidden !important;}";

/**
 * Renderiza la pieza por el mismo camino que producción.
 *
 * El documento se escribe a disco y se abre por `file://`, con las opciones de
 * navegador de `renderBrowserLaunchOptions`. Antes se cargaba con `setContent`:
 * la página quedaba en `about:blank`, que no puede leer las hojas de fuentes
 * locales, y la suite medía desbordes y exportaba referencias con la tipografía
 * de reserva en lugar de la de marca.
 */
async function renderOnce(
  browser: Browser,
  workingDirectory: string,
  caseId: string,
  piece: ComposedPiece,
): Promise<{
  backdrop: Buffer;
  nodes: readonly MeasuredNode[];
  png: Buffer;
}> {
  const format = FORMATS[piece.document.format];
  const documentPath = join(workingDirectory, `${caseId}.html`);
  await writeFile(
    documentPath,
    buildRenderHtml({ context, document: piece.document }),
    "utf8",
  );
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: format.height, width: format.width },
  });

  try {
    await page.goto(pathToFileURL(documentPath).href, { waitUntil: "load" });

    const broken: unknown = await page.evaluate(waitForRenderAssets);
    if (!Array.isArray(broken) || broken.length > 0) {
      throw new Error(
        `${caseId}: una imagen de la pieza no decodificó; no hay render que revisar.`,
      );
    }

    const measured: unknown = await page.evaluate(measuredNodesScript);
    const png = await page.locator("[data-card]").screenshot({ type: "png" });

    await page.addStyleTag({ content: textlessStylesheet });
    const backdrop = await page
      .locator("[data-card]")
      .screenshot({ type: "png" });

    return { backdrop, nodes: measured as readonly MeasuredNode[], png };
  } finally {
    await page.close();
  }
}

async function reviewCase(
  browser: Browser,
  workingDirectory: string,
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
    brief:
      entry.title === undefined
        ? compositionBrief
        : { ...compositionBrief, title: entry.title },
    format: entry.format,
    layout: entry.layout,
    region: entry.region,
    slug: `revision-${entry.id}`.slice(0, 64),
  });

  const first = await renderOnce(browser, workingDirectory, entry.id, piece);
  const second = await renderOnce(browser, workingDirectory, entry.id, piece);
  const sha256 = sha256Of(new Uint8Array(first.png));

  // Reproducibilidad: la misma composición tiene que dar el mismo PNG. Si no,
  // comparar contra una línea base no significaría nada.
  if (sha256 !== sha256Of(new Uint8Array(second.png))) {
    problems.push(`${entry.id}: dos renders de la misma pieza no coinciden.`);
  }

  const panels = first.nodes.filter((node) => node.role === "panel");

  if (panels.length === 0) {
    problems.push(`${entry.id}: la pieza no dibuja ninguna zona de marca.`);
  }

  let minimumContrast = Number.POSITIVE_INFINITY;

  for (const node of first.nodes) {
    if (node.role === "panel") {
      continue;
    }

    // Todo lo determinista vive dentro de una zona de marca —placa, velo, sello
    // o cartel—: es lo que permite afirmar el contraste, porque el fondo de esa
    // zona lo elegimos nosotros (`ADR-029`).
    if (
      panels.length > 0 &&
      !panels.some((panel) => containedIn(node, panel))
    ) {
      problems.push(
        `${entry.id}: ${node.role} se sale de su zona de marca y queda apoyado sobre la imagen generada.`,
      );
    }

    if (node.text.length === 0) {
      continue;
    }

    const backdrop = await backdropUnder(first.backdrop, node);
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
  const browser = await chromium.launch(renderBrowserLaunchOptions({}));
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "aramayo-revision-composicion-"),
  );
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
      reports.push(
        await reviewCase(browser, workingDirectory, entry, problems),
      );
    }
  } finally {
    await browser.close();
    await rm(workingDirectory, { force: true, recursive: true });
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
