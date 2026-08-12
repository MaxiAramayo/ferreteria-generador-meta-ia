import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  composedLayoutFor,
  generationImageModel,
  scoreImageQualityCase,
  summarizeImageQuality,
  visualCompositionVersion,
  visualProfileIds,
  type ImageQualityBaseline,
  type ImageQualityFactualSnapshot,
} from "@aramayo/domain";
import sharp from "sharp";

import {
  backgroundBytes,
  compositionBackgrounds,
  sha256Of,
  type CompositionBackground,
} from "../visual/composition-snapshot-cases.ts";
import { composePiece, type ComposedPiece } from "../visual/piece-composer.ts";
import {
  visualProfileFor,
  visualProfileVersion,
} from "../visual/visual-profiles.ts";
import { visualPromptVersion } from "../visual/visual-prompt-builder.ts";
import {
  imageQualityDataset,
  imageQualityDatasetVersion,
  imageQualityHumanSampleCaseIds,
  type ImageQualityDatasetEntry,
} from "./image-quality-evaluation-dataset.ts";

export const imageQualityBaselineUrl = new URL(
  "./image-quality-evaluation-baseline.json",
  import.meta.url,
);

const compositionManifestUrl = new URL(
  "../../composition-reference/manifest.json",
  import.meta.url,
);

interface CompositionManifestCase {
  readonly format: string;
  readonly id: string;
  readonly layout: string;
  readonly minimumContrast: number;
}

interface CompositionManifest {
  readonly cases: readonly CompositionManifestCase[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isHumanAssessment(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.caseId !== "string" ||
    !Array.isArray(value.criticalFindings) ||
    !value.criticalFindings.every((finding) => typeof finding === "string") ||
    !isRecord(value.scores)
  ) {
    return false;
  }
  const scores = value.scores;
  return [
    "visual-hierarchy",
    "composition",
    "product-fidelity",
    "brand-coherence",
    "context-relevance",
    "mobile-legibility",
  ].every((criterion) => typeof scores[criterion] === "number");
}

function isImageQualityBaseline(value: unknown): value is ImageQualityBaseline {
  if (!isRecord(value) || !Array.isArray(value.cases)) return false;
  const humanReview = value.humanReview;
  const metrics = value.metrics;
  return (
    typeof value.compositionVersion === "string" &&
    typeof value.datasetVersion === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.model === "string" &&
    typeof value.profileVersion === "string" &&
    typeof value.promptVersion === "string" &&
    isRecord(humanReview) &&
    (humanReview.status === "approved" ||
      humanReview.status === "pending" ||
      humanReview.status === "rejected") &&
    (humanReview.reviewedAt === null ||
      typeof humanReview.reviewedAt === "string") &&
    Array.isArray(humanReview.reviewerRoles) &&
    humanReview.reviewerRoles.every(
      (role) => role === "business-owner" || role === "visual-reviewer",
    ) &&
    Array.isArray(humanReview.sampleCaseIds) &&
    humanReview.sampleCaseIds.every((caseId) => typeof caseId === "string") &&
    Array.isArray(humanReview.assessments) &&
    humanReview.assessments.every(isHumanAssessment) &&
    isRecord(metrics) &&
    typeof metrics.blockingFailures === "number" &&
    typeof metrics.caseSuccess === "number" &&
    typeof metrics.cases === "number" &&
    typeof metrics.factualSuccess === "number" &&
    typeof metrics.technicalSuccess === "number" &&
    value.cases.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.caseId === "string" &&
        Array.isArray(entry.checks) &&
        entry.checks.every(
          (check) =>
            isRecord(check) &&
            check.blocking === true &&
            typeof check.detail === "string" &&
            (check.group === "factual" || check.group === "technical") &&
            typeof check.name === "string" &&
            typeof check.passed === "boolean",
        ) &&
        (entry.format === "cuadrado" ||
          entry.format === "feed" ||
          entry.format === "historia") &&
        typeof entry.passed === "boolean" &&
        typeof entry.overlayHash === "string" &&
        typeof entry.profileId === "string" &&
        visualProfileIds.some((profileId) => profileId === entry.profileId),
    )
  );
}

function parseCompositionManifest(raw: string): CompositionManifest {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !Array.isArray(parsed.cases)) {
    throw new Error(
      "La baseline de composición no contiene una lista de casos.",
    );
  }

  const cases: CompositionManifestCase[] = parsed.cases.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.format !== "string" ||
      typeof entry.id !== "string" ||
      typeof entry.layout !== "string" ||
      typeof entry.minimumContrast !== "number"
    ) {
      throw new Error("La baseline de composición contiene un caso inválido.");
    }
    return Object.freeze({
      format: entry.format,
      id: entry.id,
      layout: entry.layout,
      minimumContrast: entry.minimumContrast,
    });
  });

  return Object.freeze({ cases: Object.freeze(cases) });
}

const backgroundCache = new Map<CompositionBackground, Promise<Uint8Array>>();

function cachedBackground(
  background: CompositionBackground,
): Promise<Uint8Array> {
  const existing = backgroundCache.get(background);
  if (existing !== undefined) return existing;
  const pending = backgroundBytes(background);
  backgroundCache.set(background, pending);
  return pending;
}

function technicalBaselinePassed(
  entry: ImageQualityDatasetEntry,
  manifest: CompositionManifest,
): boolean {
  const region = visualProfileFor(entry.profileId).reservedSpace;
  const layout = composedLayoutFor(region);
  if (layout === null) return false;

  return compositionBackgrounds.every((background) => {
    const caseId = `${layout}-${entry.format}-${background}`;
    return manifest.cases.some(
      (candidate) =>
        candidate.id === caseId &&
        candidate.layout === layout &&
        candidate.format === entry.format &&
        candidate.minimumContrast >= 4.38,
    );
  });
}

function actualSnapshot(
  entry: ImageQualityDatasetEntry,
  piece: ComposedPiece,
): ImageQualityFactualSnapshot {
  return Object.freeze({
    callToAction: piece.plan.copy.callToAction,
    disclaimer: piece.plan.copy.validity,
    price: piece.plan.copy.price,
    productExternalIds: Object.freeze(
      entry.brief.products.map((product) => product.externalProductId),
    ),
    stockStatements: Object.freeze(
      entry.brief.verifiedFacts
        .filter((fact) => fact.claimKind === "stock")
        .map((fact) => fact.statement),
    ),
  });
}

export async function composeImageQualityCase(
  entry: ImageQualityDatasetEntry,
): Promise<ComposedPiece> {
  const bytes = await cachedBackground(entry.background);
  return composeImageQualityCaseWithBase(entry, bytes);
}

/** Compone un resultado real del proveedor para la revisión humana ciega. */
export async function composeImageQualityCaseWithBase(
  entry: ImageQualityDatasetEntry,
  bytes: Uint8Array,
): Promise<ComposedPiece> {
  const metadata = await sharp(bytes).metadata();

  if (
    metadata.format !== "png" &&
    metadata.format !== "jpeg" &&
    metadata.format !== "jpg"
  ) {
    throw new Error(`El activo de ${entry.caseId} debe ser PNG o JPEG.`);
  }

  return composePiece({
    base: {
      bytes,
      height: metadata.height,
      mimeType: metadata.format === "png" ? "image/png" : "image/jpeg",
      sha256: sha256Of(bytes),
      width: metadata.width,
    },
    brief: entry.brief,
    format: entry.format,
    region: visualProfileFor(entry.profileId).reservedSpace,
    slug: `image-quality-${entry.caseId}`.slice(0, 64),
  });
}

export async function runImageQualityEvaluation(
  generatedAt = new Date().toISOString(),
): Promise<ImageQualityBaseline> {
  const manifest = parseCompositionManifest(
    await readFile(compositionManifestUrl, "utf8"),
  );
  const cases = await Promise.all(
    imageQualityDataset().map(async (entry) => {
      const piece = await composeImageQualityCase(entry);
      return scoreImageQualityCase({
        actual: actualSnapshot(entry, piece),
        caseId: entry.caseId,
        expected: entry.expected,
        format: entry.format,
        overlayHash: piece.snapshot.overlayHash,
        profileId: entry.profileId,
        technicalBaselinePassed: technicalBaselinePassed(entry, manifest),
      });
    }),
  );

  return Object.freeze({
    cases: Object.freeze(cases),
    compositionVersion: visualCompositionVersion,
    datasetVersion: imageQualityDatasetVersion,
    generatedAt,
    humanReview: Object.freeze({
      assessments: Object.freeze([]),
      reviewedAt: null,
      reviewerRoles: Object.freeze([]),
      sampleCaseIds: imageQualityHumanSampleCaseIds,
      status: "pending",
    }),
    metrics: summarizeImageQuality(cases),
    model: generationImageModel,
    profileVersion: visualProfileVersion,
    promptVersion: visualPromptVersion,
  });
}

export async function readImageQualityBaseline(): Promise<ImageQualityBaseline> {
  const raw = await readFile(imageQualityBaselineUrl, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isImageQualityBaseline(parsed)) {
    throw new Error("La línea base de calidad de imagen es inválida.");
  }
  return parsed;
}

export const imageQualityBaselinePath = fileURLToPath(imageQualityBaselineUrl);
