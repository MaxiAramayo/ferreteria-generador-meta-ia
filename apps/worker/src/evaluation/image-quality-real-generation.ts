/**
 * Corrida real, manual y facturable de la muestra de P4-T08.
 *
 * Este módulo no vive en CI: usa el mismo gateway, modelo, prompt y preparación
 * de referencias que producción, pero escribe la evidencia en `output/`. El
 * manifiesto evita prompts y rutas locales; conserva sólo identidad, hashes,
 * request ID y uso para poder auditar la corrida sin filtrar material.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BRAND_ASSETS } from "@aramayo/design-engine";
import {
  estimateImageCostMicrousd,
  generationImageModel,
  imageReferenceCostMicrousd,
  imageSizeForFormat,
  type ImageGenerationPort,
  type VisualPromptReference,
} from "@aramayo/domain";

import { SharpVisualInputPreparer } from "../media/visual-input-preparer.ts";
import { buildVisualPrompt } from "../visual/visual-prompt-builder.ts";
import {
  imageQualityDatasetVersion,
  imageQualityHumanReviewDataset,
  type ImageQualityDatasetEntry,
} from "./image-quality-evaluation-dataset.ts";

const evaluationOrganizationId = "image-quality-staging";
const assetDirectoryUrl = new URL(
  "../../../../packages/design-engine/assets/",
  import.meta.url,
);

interface RealGenerationManifestCase {
  readonly caseId: string;
  readonly estimatedCostMicrousd: number | null;
  readonly format: ImageQualityDatasetEntry["format"];
  readonly generatedAt: string;
  readonly height: number;
  readonly imageSha256: string;
  readonly model: string;
  readonly profileId: ImageQualityDatasetEntry["profileId"];
  readonly promptHash: string;
  readonly promptVersion: string;
  readonly reference: Readonly<{
    assetId: string;
    sha256: string;
  }>;
  readonly requestId: string | null;
  readonly usage: Readonly<{
    imageInputTokens: number;
    inputTokens: number;
    outputTokens: number;
    textInputTokens: number;
    totalTokens: number;
  }> | null;
  readonly width: number;
}

export interface GenerateImageQualityRealAssetsCommand {
  readonly gateway: ImageGenerationPort;
  readonly outputDirectory: string;
  readonly productReferencePath: string | undefined;
}

export interface ImageQualityRealGenerationResult {
  readonly cases: readonly RealGenerationManifestCase[];
  readonly outputDirectory: string;
  readonly settledCostMicrousd: number | null;
}

export function imageQualityOutputReferenceCostMicrousd(): number {
  return imageQualityHumanReviewDataset().reduce(
    (total, entry) =>
      total +
      imageReferenceCostMicrousd(imageSizeForFormat(entry.format), "medium"),
    0,
  );
}

async function preparedReference(
  entry: ImageQualityDatasetEntry,
  productReferencePath: string | undefined,
): Promise<
  Readonly<{
    input: VisualPromptReference;
    bytes: Uint8Array;
    mimeType: string;
  }>
> {
  const requirement = entry.reference;
  if (requirement.status !== "available" || requirement.assetId === null) {
    throw new Error(
      `El caso ${entry.caseId} no tiene una referencia aprobada.`,
    );
  }

  let sourceBytes: Uint8Array;
  if (requirement.source === "provided-file") {
    if (productReferencePath === undefined) {
      throw new Error(
        `El caso ${entry.caseId} requiere una foto aprobada provista por archivo.`,
      );
    }
    sourceBytes = new Uint8Array(await readFile(productReferencePath));
  } else {
    const asset = BRAND_ASSETS.find(
      (candidate) => candidate.assetId === requirement.assetId,
    );
    if (asset === undefined) {
      throw new Error(
        `La referencia aprobada de ${entry.caseId} no está en la biblioteca.`,
      );
    }
    sourceBytes = new Uint8Array(
      await readFile(new URL(asset.file, assetDirectoryUrl)),
    );
  }

  const prepared = await new SharpVisualInputPreparer().prepare({
    bytes: sourceBytes,
    organizationId: evaluationOrganizationId,
    ownerOrganizationId: evaluationOrganizationId,
    role: requirement.role,
  });
  if (prepared.status === "rejected") {
    throw new Error(
      `La referencia de ${entry.caseId} fue rechazada (${prepared.rejection.code}): ${prepared.rejection.correction}`,
    );
  }

  return Object.freeze({
    bytes: prepared.prepared.reference.bytes,
    input: Object.freeze({
      assetId: requirement.assetId,
      role: requirement.role,
      sha256: prepared.prepared.reference.sha256,
    }),
    mimeType: prepared.prepared.reference.mimeType,
  });
}

export async function generateImageQualityRealAssets(
  command: GenerateImageQualityRealAssetsCommand,
): Promise<ImageQualityRealGenerationResult> {
  await mkdir(command.outputDirectory, { recursive: true });
  const manifestCases: RealGenerationManifestCase[] = [];

  for (const entry of imageQualityHumanReviewDataset()) {
    const reference = await preparedReference(
      entry,
      command.productReferencePath,
    );
    const plan = buildVisualPrompt({
      brief: entry.brief,
      format: entry.format,
      generationEnabled: true,
      references: [reference.input],
    });
    if (plan.kind !== "generated") {
      throw new Error(
        `El caso ${entry.caseId} se resolvió como ${plan.reason}; la muestra exige proveedor real.`,
      );
    }

    const generated = await command.gateway.edit({
      background: "opaque",
      kind: "edit",
      negativeGuidance: plan.negativeGuidance,
      prompt: plan.prompt,
      quality: "medium",
      references: [
        Object.freeze({
          bytes: reference.bytes,
          mimeType: reference.mimeType,
          name: `${entry.caseId}-reference.${reference.mimeType === "image/png" ? "png" : "jpg"}`,
        }),
      ],
      safetyIdentifier: createHash("sha256")
        .update(`${evaluationOrganizationId}:${entry.caseId}`)
        .digest("hex"),
      size: imageSizeForFormat(entry.format),
    });
    await writeFile(
      join(command.outputDirectory, `${entry.caseId}.png`),
      generated.bytes,
    );

    const usage = generated.usage;
    const manifestCase: RealGenerationManifestCase = Object.freeze({
      caseId: entry.caseId,
      estimatedCostMicrousd:
        usage === null ? null : estimateImageCostMicrousd(usage),
      format: entry.format,
      generatedAt: new Date().toISOString(),
      height: generated.height,
      imageSha256: generated.sha256,
      model: generated.model,
      profileId: entry.profileId,
      promptHash: plan.promptHash,
      promptVersion: plan.promptVersion,
      reference: Object.freeze({
        assetId: reference.input.assetId,
        sha256: reference.input.sha256,
      }),
      requestId: generated.requestId,
      usage:
        usage === null
          ? null
          : Object.freeze({
              imageInputTokens: usage.imageInputTokens,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              textInputTokens: usage.textInputTokens,
              totalTokens: usage.totalTokens,
            }),
      width: generated.width,
    });
    manifestCases.push(manifestCase);
    await writeFile(
      join(command.outputDirectory, "manifest.json"),
      `${JSON.stringify(
        {
          cases: manifestCases,
          datasetVersion: imageQualityDatasetVersion,
          model: generationImageModel,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    process.stdout.write(
      `Base real ${String(manifestCases.length)}/${String(imageQualityHumanReviewDataset().length)}: ${entry.caseId}\n`,
    );
  }

  const costs = manifestCases.map((entry) => entry.estimatedCostMicrousd);
  const settledCostMicrousd = costs.some((cost) => cost === null)
    ? null
    : costs.reduce<number>((total, cost) => total + (cost ?? 0), 0);
  return Object.freeze({
    cases: Object.freeze(manifestCases),
    outputDirectory: command.outputDirectory,
    settledCostMicrousd,
  });
}
