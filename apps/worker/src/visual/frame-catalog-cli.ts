/**
 * Catálogo visual de los marcos (`ADR-029`).
 *
 * Renderiza cada marco en los tres formatos sobre fotos reales de la biblioteca
 * aprobada, con el producto en posiciones distintas, más una hoja que pinta los
 * nueve marcos en los cuatro temas. Es lo que revisa el negocio: la suite de
 * composición prueba contraste y desbordes sobre fondos sintéticos, y esta
 * muestra cómo se ve cada marco con una foto de verdad.
 *
 * Renderiza por el mismo camino que producción. Los precios son de muestra y lo
 * dicen en la vigencia: no salen de ninguna fuente comercial.
 *
 * ```bash
 * pnpm frames:catalog    # deja PNG y hojas en output/marcos/
 * ```
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  COLORS,
  DESIGN_SCHEMA_VERSION,
  describeIssues,
  FORMATS,
  FRAME_LAYOUT_IDS,
  layoutSpecFor,
  parseDesignDocument,
  THEME_IDS,
  type DesignDocument,
  type FormatId,
  type FrameLayoutId,
  type ThemeId,
} from "@aramayo/design-engine";
import { chromium, type Browser } from "playwright-core";
import sharp from "sharp";

import { renderBrowserLaunchOptions } from "../rendering/playwright-renderer.ts";
import {
  buildRenderHtml,
  renderContextFor,
  waitForRenderAssets,
} from "../rendering/render-document.ts";

const outputDirectory = fileURLToPath(
  new URL("../../../../output/marcos/", import.meta.url),
);
const context = renderContextFor(ARAMAYO_BRAND_PROFILE);

interface CatalogPhoto {
  readonly alt: string;
  readonly assetId: string;
  readonly content: Readonly<Record<string, string>>;
  readonly focus: { readonly x: number; readonly y: number };
  readonly id: string;
}

/**
 * Tres fotos que cubren los casos que importan: el producto ocupando casi todo
 * el cuadro, el producto en la mitad inferior y el producto al centro con
 * fondo cargado. La última no tiene precio, para ver cómo resuelve cada marco
 * la invitación a consultar.
 */
const photos: readonly CatalogPhoto[] = [
  {
    alt: "Juego de machete y hacha en su blíster",
    assetId: "machete-hacha-biassoni",
    content: {
      badge: "Herramientas",
      callToAction: "Consultá por WhatsApp",
      price: "$ 24.500",
      subtitle: "Biassoni, en blíster.",
      title: "Juego de machete y hacha",
      validity: "Precio de muestra",
    },
    focus: { x: 50, y: 45 },
    id: "producto-grande",
  },
  {
    alt: "Atornillador inalámbrico sobre una mesa de trabajo",
    assetId: "stock-herramientas-electricas",
    content: {
      badge: "Eléctricas",
      callToAction: "Escribinos",
      price: "$ 38.900",
      subtitle: "Con batería y cargador.",
      title: "Atornillador inalámbrico",
      validity: "Precio de muestra",
    },
    focus: { x: 50, y: 75 },
    id: "producto-abajo",
  },
  {
    alt: "Botas de PVC de caña alta frente a cajas",
    assetId: "botas-seguridad-pvc",
    content: {
      callToAction: "Consultá talles",
      subtitle: "Consultá los talles por WhatsApp.",
      title: "Botas de PVC caña alta",
    },
    focus: { x: 45, y: 50 },
    id: "producto-centro",
  },
];

const formats: readonly FormatId[] = ["feed", "cuadrado", "historia"];

function documentFor(
  layout: FrameLayoutId,
  format: FormatId,
  photo: CatalogPhoto,
  theme: ThemeId,
): DesignDocument {
  const spec = layoutSpecFor(layout);
  const admitted: ReadonlySet<string> = new Set([
    ...spec.requiredFields,
    ...spec.optionalFields,
  ]);
  const content = Object.fromEntries(
    Object.entries(photo.content).filter(([field]) => admitted.has(field)),
  );
  const result = parseDesignDocument({
    content,
    format,
    layout,
    media: [
      {
        alt: photo.alt,
        fit: "cover",
        focus: photo.focus,
        reference: { assetId: photo.assetId, source: "brand-library" },
        zoom: 1,
      },
    ],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: `catalogo-${layout}-${format}-${theme}`.slice(0, 64),
    theme,
  });

  if (!result.ok) {
    throw new Error(
      `${layout} en ${format}: el documento de muestra no es válido (${describeIssues(result.issues)}).`,
    );
  }

  return result.document;
}

async function render(
  browser: Browser,
  workingDirectory: string,
  id: string,
  document: DesignDocument,
): Promise<Buffer> {
  const format = FORMATS[document.format];
  const documentPath = join(workingDirectory, `${id}.html`);
  await writeFile(documentPath, buildRenderHtml({ context, document }), "utf8");
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: format.height, width: format.width },
  });

  try {
    await page.goto(pathToFileURL(documentPath).href, { waitUntil: "load" });

    const broken: unknown = await page.evaluate(waitForRenderAssets);
    if (!Array.isArray(broken) || broken.length > 0) {
      throw new Error(`${id}: una imagen de la muestra no decodificó.`);
    }

    return await page.locator("[data-card]").screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

interface Tile {
  readonly label: string;
  readonly png: Buffer;
}

async function contactSheet(
  tiles: readonly Tile[],
  columns: number,
  scale: number,
  target: string,
): Promise<void> {
  const [first] = tiles;

  if (first === undefined) {
    return;
  }

  const metadata = await sharp(first.png).metadata();
  const tileWidth = Math.round(metadata.width * scale);
  const tileHeight = Math.round(metadata.height * scale);
  const padding = 24;
  const labelHeight = 34;
  const rows = Math.ceil(tiles.length / columns);
  const width = padding + columns * (tileWidth + padding);
  const height = padding + rows * (tileHeight + labelHeight + padding);

  const composites = await Promise.all(
    tiles.map(async (tile, index) => {
      const left = padding + (index % columns) * (tileWidth + padding);
      const top =
        padding +
        Math.floor(index / columns) * (tileHeight + labelHeight + padding);
      const image = await sharp(tile.png)
        .resize(tileWidth, tileHeight)
        .png()
        .toBuffer();
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${String(tileWidth)}" height="${String(labelHeight)}"><text x="0" y="24" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="${COLORS.paper}">${escapeXml(tile.label)}</text></svg>`,
      );

      return [
        { input: label, left, top },
        { input: image, left, top: top + labelHeight },
      ];
    }),
  );

  await sharp({
    create: { background: COLORS.humo, channels: 3, height, width },
  })
    .composite(composites.flat())
    .png()
    .toFile(target);
}

async function main(): Promise<void> {
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch(renderBrowserLaunchOptions({}));
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "aramayo-catalogo-marcos-"),
  );
  let rendered = 0;

  try {
    for (const format of formats) {
      for (const photo of photos) {
        const tiles: Tile[] = [];

        for (const layout of FRAME_LAYOUT_IDS) {
          const id = `${layout}-${format}-${photo.id}`;
          const png = await render(
            browser,
            workingDirectory,
            id,
            documentFor(layout, format, photo, "taller"),
          );
          await writeFile(join(outputDirectory, `${id}.png`), png);
          tiles.push({ label: layout, png });
          rendered += 1;
        }

        await contactSheet(
          tiles,
          5,
          format === "historia" ? 0.25 : 0.3,
          join(outputDirectory, `hoja-${format}-${photo.id}.png`),
        );
      }
    }

    const [themePhoto] = photos.filter(
      (photo) => photo.id === "producto-abajo",
    );

    if (themePhoto !== undefined) {
      const tiles: Tile[] = [];

      for (const theme of THEME_IDS) {
        for (const layout of FRAME_LAYOUT_IDS) {
          const id = `${layout}-feed-${theme}`;
          const png = await render(
            browser,
            workingDirectory,
            id,
            documentFor(layout, "feed", themePhoto, theme),
          );
          tiles.push({ label: `${layout} · ${theme}`, png });
          rendered += 1;
        }
      }

      await contactSheet(
        tiles,
        FRAME_LAYOUT_IDS.length,
        0.2,
        join(outputDirectory, "hoja-temas-feed.png"),
      );
    }
  } finally {
    await browser.close();
    await rm(workingDirectory, { force: true, recursive: true });
  }

  process.stdout.write(
    `Catálogo de marcos: ${String(rendered)} piezas renderizadas en output/marcos/.\n`,
  );
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Catálogo de marcos fallido: ${message}\n`);
  process.exitCode = 1;
}
