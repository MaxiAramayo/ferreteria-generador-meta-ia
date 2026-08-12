import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";

import { createPlaywrightRenderer } from "../rendering/playwright-renderer.ts";
import { renderContextFor } from "../rendering/render-document.ts";
import {
  imageCreativePrototypeCases,
  imageCreativePrototypeVersion,
} from "./image-creative-prototypes.ts";

const outputDirectory = new URL(
  "../../../../output/image-creative-prototypes/",
  import.meta.url,
);

async function main(): Promise<void> {
  const cases = imageCreativePrototypeCases();
  const renderer = createPlaywrightRenderer({
    concurrency: 2,
    context: renderContextFor(ARAMAYO_BRAND_PROFILE),
  });

  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });

  try {
    const rendered = await Promise.all(
      cases.map(async (prototypeCase) => {
        const result = await renderer.render({
          document: prototypeCase.document,
          requestId: prototypeCase.caseId,
          scale: 1,
        });

        if (!result.ok) {
          throw new Error(
            `${prototypeCase.caseId} falló en ${result.failure.stage}.`,
          );
        }

        const fileName = `${prototypeCase.caseId}.png`;
        await writeFile(new URL(fileName, outputDirectory), result.image.png);

        return Object.freeze({
          bytes: result.image.byteLength,
          caseId: prototypeCase.caseId,
          family: prototypeCase.family,
          file: fileName,
          format: prototypeCase.document.format,
          height: result.image.height,
          layout: prototypeCase.document.layout,
          publishable: prototypeCase.publishable,
          sha256: result.image.sha256,
          truthMode: prototypeCase.truthMode,
          width: result.image.width,
        });
      }),
    );

    await writeFile(
      new URL("manifest.json", outputDirectory),
      `${JSON.stringify(
        {
          aiCalls: 0,
          generatedAt: new Date().toISOString(),
          pieces: rendered,
          publishable: false,
          version: imageCreativePrototypeVersion,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    process.stdout.write(
      `Prototipos exportados: ${String(rendered.length)} (${String(rendered.filter((piece) => piece.format === "feed").length)} feed, ${String(rendered.filter((piece) => piece.format === "historia").length)} historias, 0 llamadas IA).\n`,
    );
    process.stdout.write(`${fileURLToPath(outputDirectory)}\n`);
  } finally {
    await renderer.close();
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`No se pudieron generar los prototipos: ${message}\n`);
  process.exitCode = 1;
}
