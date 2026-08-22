import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium, type Browser } from "playwright-core";
import { format as formatSource } from "prettier";
import sharp from "sharp";

import {
  buildMetaAppReviewArtifactHtml,
  metaAppReviewArtifact,
} from "./artifact.ts";

const outputDirectory = new URL(
  "../../docs/integrations/assets/",
  import.meta.url,
);
const publicOutputDirectory = new URL(
  "../../apps/web/public/",
  import.meta.url,
);
const debugDirectory = new URL(
  "../../output/meta-app-review-debug/",
  import.meta.url,
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(
  png: Buffer,
): Readonly<{ height: number; width: number }> {
  const signature = png.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || png.length < 24) {
    throw new Error("El artefacto generado no es un PNG válido.");
  }
  return Object.freeze({
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  });
}

interface PixelComparison {
  readonly differentChannels: number;
  readonly maximumDelta: number;
}

const maximumDifferentChannels = 128;

/**
 * El PNG versionado es la autoridad exacta. Esta segunda captura comprueba que
 * Chrome no cambió la composición: se tolera únicamente el ruido de ±1 que el
 * antialiasing puede introducir en unos pocos canales aun con el mismo binario.
 */
async function compareRenderedPixels(
  first: Buffer,
  second: Buffer,
): Promise<PixelComparison> {
  const [firstRaw, secondRaw] = await Promise.all([
    sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(second).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (
    firstRaw.info.width !== secondRaw.info.width ||
    firstRaw.info.height !== secondRaw.info.height ||
    firstRaw.info.channels !== secondRaw.info.channels ||
    firstRaw.data.length !== secondRaw.data.length
  ) {
    throw new Error("Los renders comparados no tienen la misma geometría.");
  }

  let differentChannels = 0;
  let maximumDelta = 0;
  for (let index = 0; index < firstRaw.data.length; index += 1) {
    const firstChannel = firstRaw.data[index];
    const secondChannel = secondRaw.data[index];
    if (firstChannel === undefined || secondChannel === undefined) {
      throw new Error("El raster perdió un canal durante la comparación.");
    }
    const delta = Math.abs(firstChannel - secondChannel);
    if (delta > 0) differentChannels += 1;
    maximumDelta = Math.max(maximumDelta, delta);
  }
  return Object.freeze({ differentChannels, maximumDelta });
}

async function renderArtifact(
  browser: Browser,
  htmlUrl: string,
): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: {
      height: metaAppReviewArtifact.height,
      width: metaAppReviewArtifact.width,
    },
  });
  try {
    await page.goto(htmlUrl, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    return await page.locator("#artifact").screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "aramayo-meta-review-"),
  );
  const htmlPath = join(temporaryDirectory, "artifact.html");
  let browser: Browser | undefined;

  try {
    await writeFile(htmlPath, buildMetaAppReviewArtifactHtml(), "utf8");
    browser = await chromium.launch({
      args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
      channel: "chrome",
      headless: true,
    });
    const htmlUrl = pathToFileURL(htmlPath).toString();
    const first = await renderArtifact(browser, htmlUrl);
    const second = await renderArtifact(browser, htmlUrl);
    const pixelComparison = await compareRenderedPixels(first, second);
    if (
      pixelComparison.maximumDelta > 1 ||
      pixelComparison.differentChannels > maximumDifferentChannels
    ) {
      await mkdir(debugDirectory, { recursive: true });
      await writeFile(new URL("first.png", debugDirectory), first);
      await writeFile(new URL("second.png", debugDirectory), second);
      throw new Error(
        `Dos renders consecutivos difieren en ${String(pixelComparison.differentChannels)} canales y delta máximo ${String(pixelComparison.maximumDelta)}.`,
      );
    }

    const approvedPath = new URL(
      metaAppReviewArtifact.fileName,
      outputDirectory,
    );
    const approved = await readFile(approvedPath).catch(() => first);
    const approvedSha256 = sha256(approved);
    if (approvedSha256 !== metaAppReviewArtifact.sha256) {
      throw new Error(
        `El PNG versionado no coincide con el SHA aprobado: ${approvedSha256}.`,
      );
    }
    const approvedComparison = await compareRenderedPixels(approved, first);
    if (
      approvedComparison.maximumDelta > 1 ||
      approvedComparison.differentChannels > maximumDifferentChannels
    ) {
      throw new Error(
        `El render nuevo difiere del PNG aprobado en ${String(approvedComparison.differentChannels)} canales y delta máximo ${String(approvedComparison.maximumDelta)}.`,
      );
    }

    const dimensions = pngDimensions(approved);
    if (
      dimensions.width !== metaAppReviewArtifact.width ||
      dimensions.height !== metaAppReviewArtifact.height
    ) {
      throw new Error("El PNG no respeta las dimensiones declaradas.");
    }

    await mkdir(outputDirectory, { recursive: true });
    await mkdir(publicOutputDirectory, { recursive: true });
    await writeFile(
      new URL(metaAppReviewArtifact.fileName, outputDirectory),
      approved,
    );
    await writeFile(
      new URL(metaAppReviewArtifact.fileName, publicOutputDirectory),
      approved,
    );
    const manifest = await formatSource(
      JSON.stringify(
        {
          administrativeApprovalAt:
            metaAppReviewArtifact.administrativeApprovalAt,
          aiCalls: 0,
          altText: metaAppReviewArtifact.altText,
          approvalStatus: "approved-for-single-app-review-order",
          byteLength: approved.byteLength,
          copy: metaAppReviewArtifact.copy,
          file: metaAppReviewArtifact.fileName,
          height: dimensions.height,
          publicationApproval: metaAppReviewArtifact.publicationApproval,
          renderComparison: approvedComparison,
          sha256: approvedSha256,
          targets: metaAppReviewArtifact.targets,
          version: metaAppReviewArtifact.version,
          width: dimensions.width,
        },
        null,
        2,
      ),
      { parser: "json" },
    );
    await writeFile(
      new URL("meta-app-review-technical.json", outputDirectory),
      manifest,
      "utf8",
    );

    process.stdout.write(
      `Artefacto App Review: ${metaAppReviewArtifact.fileName} ${String(dimensions.width)}x${String(dimensions.height)} sha256=${approvedSha256}\n`,
    );
    process.stdout.write(`${fileURLToPath(outputDirectory)}\n`);
  } finally {
    await browser?.close().catch(() => undefined);
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(
    `No se pudo generar el artefacto de App Review: ${message}\n`,
  );
  process.exitCode = 1;
}
