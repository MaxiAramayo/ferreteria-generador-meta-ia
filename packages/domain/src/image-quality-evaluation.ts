/**
 * Evaluación visual y factual de una pieza generada.
 *
 * La estética y la exactitud comercial no se promedian entre sí. Producto,
 * precio, stock, CTA y disclaimer son verificaciones binarias: un error en
 * cualquiera bloquea el caso completo aunque la pieza sea visualmente buena.
 * La calidad estética requiere revisión humana ciega y nunca se autoaprueba.
 */

import type { ComposedFormatId } from "./visual-composition.ts";
import type { VisualProfileId } from "./visual-prompt.ts";

export const imageQualityFactualCheckNames = [
  "product",
  "price",
  "stock",
  "call-to-action",
  "disclaimer",
] as const;

export const imageQualityTechnicalCheckNames = [
  "approved-composition-baseline",
] as const;

export const imageQualityHumanCriteria = [
  "visual-hierarchy",
  "composition",
  "product-fidelity",
  "brand-coherence",
  "context-relevance",
  "mobile-legibility",
] as const;

export const imageQualityRequiredReviewerRoles = [
  "business-owner",
  "visual-reviewer",
] as const;

export const imageQualityHumanThresholds = Object.freeze({
  minimumCaseAverage: 4,
  minimumCriterion: 3,
  minimumSampleAverage: 4.2,
});

export type ImageQualityFactualCheckName =
  (typeof imageQualityFactualCheckNames)[number];
export type ImageQualityTechnicalCheckName =
  (typeof imageQualityTechnicalCheckNames)[number];
export type ImageQualityHumanCriterion =
  (typeof imageQualityHumanCriteria)[number];
export type ImageQualityReviewerRole =
  (typeof imageQualityRequiredReviewerRoles)[number];

export interface ImageQualityFactualSnapshot {
  readonly callToAction: string;
  /** Vigencia, condición o advertencia visible; nulo cuando no corresponde. */
  readonly disclaimer: string | null;
  readonly price: string | null;
  readonly productExternalIds: readonly string[];
  /** Enunciados de stock sustentados, sin inferir disponibilidad. */
  readonly stockStatements: readonly string[];
}

export interface ImageQualityCheck {
  readonly blocking: true;
  readonly detail: string;
  readonly group: "factual" | "technical";
  readonly name: ImageQualityFactualCheckName | ImageQualityTechnicalCheckName;
  readonly passed: boolean;
}

export interface ImageQualityCaseResult {
  readonly caseId: string;
  readonly checks: readonly ImageQualityCheck[];
  readonly overlayHash: string;
  readonly format: ComposedFormatId;
  readonly passed: boolean;
  readonly profileId: VisualProfileId;
}

export interface ImageQualityMetrics {
  readonly blockingFailures: number;
  readonly caseSuccess: number;
  readonly cases: number;
  readonly factualSuccess: number;
  readonly technicalSuccess: number;
}

export interface ImageQualityHumanReview {
  readonly assessments: readonly ImageQualityHumanAssessment[];
  readonly reviewedAt: string | null;
  readonly reviewerRoles: readonly ImageQualityReviewerRole[];
  readonly sampleCaseIds: readonly string[];
  readonly status: "approved" | "pending" | "rejected";
}

export interface ImageQualityHumanAssessment {
  readonly caseId: string;
  readonly criticalFindings: readonly string[];
  readonly scores: Readonly<Record<ImageQualityHumanCriterion, number>>;
}

export interface ImageQualityBaseline {
  readonly cases: readonly ImageQualityCaseResult[];
  readonly compositionVersion: string;
  readonly datasetVersion: string;
  readonly generatedAt: string;
  readonly humanReview: ImageQualityHumanReview;
  readonly metrics: ImageQualityMetrics;
  readonly model: string;
  readonly profileVersion: string;
  readonly promptVersion: string;
}

function equalTextArrays(
  first: readonly string[],
  second: readonly string[],
): boolean {
  const sortedFirst = [...first].sort((left, right) =>
    left.localeCompare(right),
  );
  const sortedSecond = [...second].sort((left, right) =>
    left.localeCompare(right),
  );
  return (
    sortedFirst.length === sortedSecond.length &&
    sortedFirst.every((entry, index) => entry === sortedSecond[index])
  );
}

function factualCheck(
  name: ImageQualityFactualCheckName,
  passed: boolean,
  detail: string,
): ImageQualityCheck {
  return Object.freeze({
    blocking: true,
    detail,
    group: "factual",
    name,
    passed,
  });
}

export function scoreImageQualityCase(
  input: Readonly<{
    actual: ImageQualityFactualSnapshot;
    caseId: string;
    overlayHash: string;
    expected: ImageQualityFactualSnapshot;
    format: ComposedFormatId;
    profileId: VisualProfileId;
    technicalBaselinePassed: boolean;
  }>,
): ImageQualityCaseResult {
  const checks: readonly ImageQualityCheck[] = Object.freeze([
    factualCheck(
      "product",
      equalTextArrays(
        input.actual.productExternalIds,
        input.expected.productExternalIds,
      ),
      "Los productos deben coincidir exactamente con el snapshot factual.",
    ),
    factualCheck(
      "price",
      input.actual.price === input.expected.price,
      "El precio visible y su ausencia deben coincidir con el snapshot.",
    ),
    factualCheck(
      "stock",
      equalTextArrays(
        input.actual.stockStatements,
        input.expected.stockStatements,
      ),
      "El stock no puede inferirse ni omitir un enunciado sustentado.",
    ),
    factualCheck(
      "call-to-action",
      input.actual.callToAction === input.expected.callToAction,
      "El CTA debe ser exactamente la acción aprobada.",
    ),
    factualCheck(
      "disclaimer",
      input.actual.disclaimer === input.expected.disclaimer,
      "La vigencia, condición o advertencia debe coincidir con el snapshot.",
    ),
    Object.freeze({
      blocking: true as const,
      detail:
        "El perfil y formato deben conservar una composición técnica aprobada.",
      group: "technical" as const,
      name: "approved-composition-baseline" as const,
      passed: input.technicalBaselinePassed,
    }),
  ]);

  return Object.freeze({
    caseId: input.caseId,
    checks,
    format: input.format,
    overlayHash: input.overlayHash,
    passed: checks.every((entry) => entry.passed),
    profileId: input.profileId,
  });
}

export function summarizeImageQuality(
  cases: readonly ImageQualityCaseResult[],
): ImageQualityMetrics {
  const checks = cases.flatMap((entry) => entry.checks);
  const factual = checks.filter((entry) => entry.group === "factual");
  const technical = checks.filter((entry) => entry.group === "technical");
  const ratio = (entries: readonly ImageQualityCheck[]): number =>
    entries.length === 0
      ? 0
      : entries.filter((entry) => entry.passed).length / entries.length;

  return Object.freeze({
    blockingFailures: checks.filter((entry) => !entry.passed).length,
    caseSuccess:
      cases.length === 0
        ? 0
        : cases.filter((entry) => entry.passed).length / cases.length,
    cases: cases.length,
    factualSuccess: ratio(factual),
    technicalSuccess: ratio(technical),
  });
}

export type ImageQualityGateFailure =
  | "automated-failure"
  | "baseline-drift"
  | "empty-dataset"
  | "human-review-pending"
  | "human-review-rejected"
  | "human-review-incomplete"
  | "incomplete-profile-format-coverage"
  | "stale-composition"
  | "stale-dataset"
  | "stale-model"
  | "stale-profile"
  | "stale-prompt";

export function checkImageQualityGate(
  input: Readonly<{
    baseline: ImageQualityBaseline;
    compositionVersion: string;
    currentCases: readonly ImageQualityCaseResult[];
    datasetVersion: string;
    expectedCases: number;
    expectedHumanSampleCaseIds: readonly string[];
    model: string;
    profileVersion: string;
    promptVersion: string;
  }>,
): readonly ImageQualityGateFailure[] {
  const failures: ImageQualityGateFailure[] = [];
  if (input.baseline.promptVersion !== input.promptVersion)
    failures.push("stale-prompt");
  if (input.baseline.profileVersion !== input.profileVersion)
    failures.push("stale-profile");
  if (input.baseline.model !== input.model) failures.push("stale-model");
  if (input.baseline.compositionVersion !== input.compositionVersion)
    failures.push("stale-composition");
  if (input.baseline.datasetVersion !== input.datasetVersion)
    failures.push("stale-dataset");
  const baselineCases = JSON.stringify(input.baseline.cases);
  const currentCases = JSON.stringify(input.currentCases);
  if (baselineCases !== currentCases) failures.push("baseline-drift");
  if (input.baseline.metrics.cases === 0) failures.push("empty-dataset");
  if (
    input.baseline.metrics.cases !== input.expectedCases ||
    input.baseline.cases.length !== input.expectedCases
  ) {
    failures.push("incomplete-profile-format-coverage");
  }
  if (
    input.baseline.metrics.blockingFailures > 0 ||
    input.baseline.metrics.caseSuccess !== 1 ||
    input.baseline.metrics.factualSuccess !== 1 ||
    input.baseline.metrics.technicalSuccess !== 1
  ) {
    failures.push("automated-failure");
  }
  if (input.baseline.humanReview.status === "pending")
    failures.push("human-review-pending");
  if (input.baseline.humanReview.status === "rejected")
    failures.push("human-review-rejected");
  if (
    input.baseline.humanReview.status === "approved" &&
    !isCompleteHumanReview(
      input.baseline.humanReview,
      input.expectedHumanSampleCaseIds,
    )
  ) {
    failures.push("human-review-incomplete");
  }
  return Object.freeze(failures);
}

function isCompleteHumanReview(
  review: ImageQualityHumanReview,
  expectedSampleCaseIds: readonly string[],
): boolean {
  if (
    review.reviewedAt === null ||
    !imageQualityRequiredReviewerRoles.every((role) =>
      review.reviewerRoles.includes(role),
    ) ||
    !equalTextArrays(review.sampleCaseIds, expectedSampleCaseIds) ||
    review.assessments.length !== expectedSampleCaseIds.length
  ) {
    return false;
  }

  const assessmentsByCase = new Map(
    review.assessments.map((assessment) => [assessment.caseId, assessment]),
  );
  if (assessmentsByCase.size !== expectedSampleCaseIds.length) return false;

  const caseAverages: number[] = [];
  for (const caseId of expectedSampleCaseIds) {
    const assessment = assessmentsByCase.get(caseId);
    if (assessment === undefined || assessment.criticalFindings.length > 0) {
      return false;
    }
    const scores = imageQualityHumanCriteria.map(
      (criterion) => assessment.scores[criterion],
    );
    if (
      scores.some(
        (score) =>
          !Number.isInteger(score) ||
          score < imageQualityHumanThresholds.minimumCriterion ||
          score > 5,
      )
    ) {
      return false;
    }
    const average =
      scores.reduce((total, score) => total + score, 0) / scores.length;
    if (average < imageQualityHumanThresholds.minimumCaseAverage) return false;
    caseAverages.push(average);
  }

  return (
    caseAverages.reduce((total, average) => total + average, 0) /
      caseAverages.length >=
    imageQualityHumanThresholds.minimumSampleAverage
  );
}
