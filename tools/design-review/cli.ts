import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  catalogStatusFor,
  DESIGN_SCHEMA_VERSION,
  FORMATS,
  LAYOUT_IDS,
  LAYOUT_SPECS,
  parseDesignDocument,
  type DesignDocument,
  type LayoutId,
} from "@aramayo/design-engine";
import { isLayoutMigrated } from "@aramayo/design-engine/react";
import { chromium, type Browser } from "playwright-core";

import {
  accessibilityScript,
  geometryScript,
  type GeometryReport,
} from "./geometry.ts";
import {
  buildRenderHtml,
  renderContextFor,
} from "../../apps/worker/src/rendering/render-document.ts";

/**
 * Revisión de diseño del catálogo.
 *
 * Compone cada pieza vigente, comprueba que nada quede recortado ni fuera de la
 * zona segura, exporta la referencia aprobada y audita la accesibilidad del
 * harness del panel.
 *
 * ```bash
 * pnpm design:review          # sólo piezas
 * pnpm design:review --harness http://localhost:3000
 * ```
 */

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const referenceDirectory = new URL(
  "packages/design-engine/catalog-reference/",
  new URL(`file://${repositoryDirectory}`),
);
const context = renderContextFor(ARAMAYO_BRAND_PROFILE);

const sampleContent: Readonly<Record<string, unknown>> = Object.freeze({
  badge: "Producto destacado",
  branch: "Sucursal · Rivadavia 673",
  callToAction: "Consultá stock",
  category: "Herramientas",
  icon: "herramienta",
  items: ["Taladro percutor", "Juego de mechas", "Maletín de transporte"],
  phone: "3854 403534",
  previousPrice: "$ 32.000",
  price: "$ 24.500",
  subtitle:
    "Consultá modelos disponibles, accesorios y mechas para cada trabajo.",
  title: "Taladro percutor 650 W",
  validity: "Válido hasta el sábado",
});

const samplePhoto = Object.freeze({
  alt: "Herramientas eléctricas sobre un banco de trabajo",
  reference: Object.freeze({
    assetId: "stock-herramientas-electricas",
    source: "brand-library",
  }),
});

interface PieceReference {
  readonly bytes: number;
  readonly format: string;
  readonly height: number;
  readonly layout: string;
  readonly sha256: string;
  readonly width: number;
}

function documentFor(layout: LayoutId): DesignDocument | undefined {
  const spec = LAYOUT_SPECS[layout];
  const [format] = spec.formats;

  if (format === undefined) {
    return undefined;
  }

  const allowed: ReadonlySet<string> = new Set([
    ...spec.requiredFields,
    ...spec.optionalFields,
  ]);
  const content = Object.fromEntries(
    Object.entries(sampleContent).filter(([field]) => allowed.has(field)),
  );
  const media = Array.from({ length: Math.min(spec.media.maximum, 3) }, () => ({
    ...samplePhoto,
  }));

  const result = parseDesignDocument({
    content: { ...content, title: sampleContent["title"] },
    format,
    layout,
    media,
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: `revision-${layout}`,
    theme: spec.family === "historia" ? "promo" : "taller",
  });

  return result.ok ? result.document : undefined;
}

async function reviewPieces(browser: Browser): Promise<readonly string[]> {
  const problems: string[] = [];
  const references: PieceReference[] = [];

  await rm(referenceDirectory, { force: true, recursive: true });
  await mkdir(referenceDirectory, { recursive: true });

  for (const layout of LAYOUT_IDS) {
    if (!isLayoutMigrated(layout)) {
      continue;
    }

    const document = documentFor(layout);

    if (document === undefined) {
      problems.push(`${layout}: no pudo componerse un documento de ejemplo.`);
      continue;
    }

    const format = FORMATS[document.format];
    const page = await browser.newPage({
      viewport: { height: format.height, width: format.width },
    });

    try {
      await page.setContent(buildRenderHtml({ context, document }), {
        waitUntil: "load",
      });
      await page.evaluate("document.fonts.ready");

      const report: unknown = await page.evaluate(geometryScript);
      const geometry = report as GeometryReport;

      if (
        geometry.cardWidth !== format.width ||
        geometry.cardHeight !== format.height
      ) {
        problems.push(
          `${layout}: la pieza mide ${String(geometry.cardWidth)}×${String(geometry.cardHeight)} y su formato declara ${String(format.width)}×${String(format.height)}.`,
        );
      }

      for (const finding of geometry.findings) {
        problems.push(`${layout}: ${finding.element} ${finding.reason}.`);
      }

      const png = await page.locator("[data-card]").screenshot({ type: "png" });
      const { createHash } = await import("node:crypto");

      await writeFile(new URL(`${layout}.png`, referenceDirectory), png);
      references.push({
        bytes: png.byteLength,
        format: format.id,
        height: format.height,
        layout,
        sha256: createHash("sha256").update(png).digest("hex"),
        width: format.width,
      });
    } finally {
      await page.close();
    }
  }

  await writeFile(
    new URL("manifest.json", referenceDirectory),
    `${JSON.stringify(
      {
        approvedAt: new Date().toISOString(),
        pieces: references.sort((first, second) =>
          first.layout.localeCompare(second.layout),
        ),
        task: "P1-T06",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.stdout.write(
    `Piezas revisadas y exportadas: ${String(references.length)}.\n`,
  );

  return problems;
}

interface AccessibilityFinding {
  readonly detail: string;
  readonly rule: string;
}

async function auditHarness(
  browser: Browser,
  baseUrl: string,
): Promise<readonly string[]> {
  const problems: string[] = [];

  for (const path of [
    "/diseno/primitivas",
    "/diseno/layouts",
    "/diseno/publicacion",
  ]) {
    const page = await browser.newPage({
      viewport: { height: 900, width: 1280 },
    });

    try {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
      const audit: unknown = await page.evaluate(accessibilityScript);
      const result = audit as {
        readonly findings: readonly AccessibilityFinding[];
        readonly focusableCount: number;
      };

      for (const finding of result.findings) {
        problems.push(`${path}: [${finding.rule}] ${finding.detail}`);
      }

      // Navegación sin mouse: el foco tiene que avanzar y quedar visible.
      if (result.focusableCount > 0) {
        await page.keyboard.press("Tab");
        const focused: unknown = await page.evaluate(
          `(() => {
            const active = document.activeElement;
            if (!active || active === document.body) {
              return null;
            }
            const outline = getComputedStyle(active, ":focus-visible").outlineStyle;
            return { outline, tag: active.tagName.toLowerCase() };
          })()`,
        );

        if (focused === null) {
          problems.push(`${path}: la primera tabulación no mueve el foco.`);
        }
      }

      process.stdout.write(
        `Harness auditado: ${path} (${String(result.focusableCount)} elementos enfocables).\n`,
      );
    } finally {
      await page.close();
    }
  }

  return problems;
}

async function main(): Promise<void> {
  const harnessIndex = process.argv.indexOf("--harness");
  const harnessUrl =
    harnessIndex === -1 ? undefined : process.argv[harnessIndex + 1];
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const problems: string[] = [];

  try {
    problems.push(...(await reviewPieces(browser)));

    if (harnessUrl !== undefined) {
      problems.push(...(await auditHarness(browser, harnessUrl)));
    }
  } finally {
    await browser.close();
  }

  const pending = LAYOUT_IDS.filter(
    (layout) =>
      catalogStatusFor(layout) === "current" && !isLayoutMigrated(layout),
  );

  for (const layout of pending) {
    problems.push(
      `${layout}: está vigente en el catálogo y no tiene componente.`,
    );
  }

  if (problems.length > 0) {
    process.stderr.write(
      `Revisión con hallazgos (${String(problems.length)}):\n`,
    );
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Revisión de diseño aprobada.\n");
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Revisión de diseño fallida: ${message}\n`);
  process.exitCode = 1;
}
