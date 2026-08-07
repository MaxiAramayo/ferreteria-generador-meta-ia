import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  checkImageQualityGate,
  type ImageQualityBaseline,
  type ImageQualityHumanReview,
} from "@aramayo/domain";

import { createPlaywrightRenderer } from "../rendering/playwright-renderer.ts";
import { renderContextFor } from "../rendering/render-document.ts";
import {
  imageQualityDataset,
  imageQualityHumanSampleCaseIds,
} from "./image-quality-evaluation-dataset.ts";
import {
  composeImageQualityCaseWithBase,
  imageQualityBaselinePath,
  readImageQualityBaseline,
  runImageQualityEvaluation,
} from "./image-quality-evaluation.service.ts";

const outputDirectoryUrl = new URL(
  "../../../../output/image-quality-evaluation/",
  import.meta.url,
);
const reviewDirectoryUrl = new URL(
  "../../../../output/image-quality-review/",
  import.meta.url,
);

async function previousBaseline(): Promise<ImageQualityBaseline | null> {
  try {
    return await readImageQualityBaseline();
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return null;
    }
    throw cause;
  }
}

function sameAutomaticIdentity(
  previous: ImageQualityBaseline,
  current: ImageQualityBaseline,
): boolean {
  return (
    previous.compositionVersion === current.compositionVersion &&
    previous.datasetVersion === current.datasetVersion &&
    previous.model === current.model &&
    previous.profileVersion === current.profileVersion &&
    previous.promptVersion === current.promptVersion &&
    JSON.stringify(previous.cases) === JSON.stringify(current.cases)
  );
}

function withPreservedHumanReview(
  current: ImageQualityBaseline,
  previous: ImageQualityBaseline | null,
): ImageQualityBaseline {
  const humanReview: ImageQualityHumanReview =
    previous !== null && sameAutomaticIdentity(previous, current)
      ? previous.humanReview
      : current.humanReview;
  return Object.freeze({ ...current, humanReview });
}

async function writeReport(report: ImageQualityBaseline): Promise<void> {
  await mkdir(outputDirectoryUrl, { recursive: true });
  await writeFile(
    new URL("report.json", outputDirectoryUrl),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

function reviewAssetsDirectory(): string | null {
  const argument = process.argv.find((entry) =>
    entry.startsWith("--review-assets="),
  );
  if (argument === undefined) return null;
  const supplied = argument.slice("--review-assets=".length).trim();
  return supplied.length === 0 ? null : resolve(supplied);
}

async function readGeneratedBase(
  directory: string,
  caseId: string,
): Promise<Uint8Array> {
  for (const extension of ["png", "jpg", "jpeg"] as const) {
    try {
      return new Uint8Array(
        await readFile(join(directory, `${caseId}.${extension}`)),
      );
    } catch {
      // Probar la siguiente extensión; la ausencia final se informa con el ID.
    }
  }
  throw new Error(
    `Falta el resultado generado para ${caseId} en ${directory} (PNG o JPEG).`,
  );
}

async function writeBlindReviewBundle(assetsDirectory: string): Promise<void> {
  const byId = new Map(
    imageQualityDataset().map((entry) => [entry.caseId, entry]),
  );
  const missingReferences = imageQualityHumanSampleCaseIds.filter(
    (caseId) => byId.get(caseId)?.reference.status === "missing",
  );
  if (missingReferences.length > 0) {
    throw new Error(
      `La muestra no puede revisarse: faltan referencias aprobadas para ${missingReferences.join(", ")}.`,
    );
  }
  const renderer = createPlaywrightRenderer({
    concurrency: 2,
    context: renderContextFor(ARAMAYO_BRAND_PROFILE),
  });
  const answerKey: Readonly<Record<string, unknown>>[] = [];

  await rm(reviewDirectoryUrl, { force: true, recursive: true });
  await mkdir(reviewDirectoryUrl, { recursive: true });

  try {
    for (const [index, caseId] of imageQualityHumanSampleCaseIds.entries()) {
      const entry = byId.get(caseId);
      if (entry === undefined) {
        throw new Error(`El caso humano ${caseId} no existe en el dataset.`);
      }
      const label = `A${String(index + 1).padStart(2, "0")}`;
      const baseBytes = await readGeneratedBase(assetsDirectory, caseId);
      const piece = await composeImageQualityCaseWithBase(entry, baseBytes);
      const rendered = await renderer.render({
        document: piece.document,
        requestId: `quality-review-${label}`,
      });
      if (!rendered.ok) {
        throw new Error(`No se pudo renderizar la muestra ciega ${label}.`);
      }
      await writeFile(
        new URL(`${label}.png`, reviewDirectoryUrl),
        rendered.image.png,
      );
      answerKey.push(
        Object.freeze({
          caseId,
          baseSha256: piece.snapshot.baseSha256,
          category: entry.category,
          expected: entry.expected,
          format: entry.format,
          label,
          profileId: entry.profileId,
          reference: entry.reference,
        }),
      );
    }
  } finally {
    await renderer.close();
  }

  const rows = imageQualityHumanSampleCaseIds.map((_, index) => {
    const label = `A${String(index + 1).padStart(2, "0")}`;
    return `| ${label} |  |  |  |  |  |  |  |`;
  });
  const sheet = [
    "# Revisión ciega de calidad de imagen",
    "",
    "Evaluar cada imagen de 1 (rechazada) a 5 (excelente). No abrir `answer-key.json` hasta terminar. Registrar cualquier error crítico por separado: producto incorrecto, texto ilegible, riesgo de seguridad o marca incoherente.",
    "",
    "| Caso | Jerarquía | Composición | Fidelidad producto | Marca | Contexto | Lectura móvil | Hallazgo crítico |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
    ...rows,
    "",
    "## Firmas",
    "",
    "- Responsable comercial:",
    "- Responsable visual:",
    "- Fecha:",
    "",
  ].join("\n");
  await writeFile(
    new URL("review-sheet.md", reviewDirectoryUrl),
    sheet,
    "utf8",
  );
  await writeFile(
    new URL("answer-key.json", reviewDirectoryUrl),
    `${JSON.stringify(answerKey, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(
    `Revisión ciega preparada: ${String(answerKey.length)} imágenes en ${fileURLToPath(reviewDirectoryUrl)}\n`,
  );
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const reviewBundle = process.argv.includes("--review-bundle");
  const previous = await previousBaseline();
  const current = withPreservedHumanReview(
    await runImageQualityEvaluation(),
    previous,
  );
  await writeReport(current);

  if (current.metrics.blockingFailures > 0) {
    throw new Error(
      `La evaluación automática detectó ${String(current.metrics.blockingFailures)} fallos bloqueantes.`,
    );
  }

  if (write) {
    await writeFile(
      imageQualityBaselinePath,
      `${JSON.stringify(current, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `Baseline automática: ${String(current.metrics.cases)} casos guardados en ${imageQualityBaselinePath}.\n`,
    );
  } else if (previous === null) {
    throw new Error(
      "No existe baseline de calidad; ejecutá la evaluación con --write.",
    );
  } else {
    const failures = checkImageQualityGate({
      baseline: previous,
      compositionVersion: current.compositionVersion,
      currentCases: current.cases,
      datasetVersion: current.datasetVersion,
      expectedCases: current.metrics.cases,
      expectedHumanSampleCaseIds: imageQualityHumanSampleCaseIds,
      model: current.model,
      profileVersion: current.profileVersion,
      promptVersion: current.promptVersion,
    });
    if (failures.length > 0) {
      process.stderr.write(
        `Gate de calidad bloqueado: ${failures.join(", ")}.\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `Gate de calidad aprobado: ${String(current.metrics.cases)} casos sin regresiones.\n`,
      );
    }
  }

  if (reviewBundle) {
    const assetsDirectory = reviewAssetsDirectory();
    if (assetsDirectory === null) {
      throw new Error(
        "--review-bundle requiere --review-assets=/directorio con los 12 resultados reales del proveedor.",
      );
    }
    await writeBlindReviewBundle(assetsDirectory);
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Evaluación de imagen fallida: ${message}\n`);
  process.exitCode = 1;
}
