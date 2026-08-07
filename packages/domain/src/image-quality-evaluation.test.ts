import assert from "node:assert/strict";
import test from "node:test";

import {
  checkImageQualityGate,
  scoreImageQualityCase,
  summarizeImageQuality,
  type ImageQualityBaseline,
  type ImageQualityFactualSnapshot,
} from "./image-quality-evaluation.ts";

const snapshot: ImageQualityFactualSnapshot = Object.freeze({
  callToAction: "Consultanos por WhatsApp",
  disclaimer: "Hasta el sábado",
  price: "$ 24.500",
  productExternalIds: Object.freeze(["product-101"]),
  stockStatements: Object.freeze(["Hay 4 unidades en Casa central."]),
});

test("separa exactitud factual de la baseline técnica", () => {
  const result = scoreImageQualityCase({
    actual: snapshot,
    caseId: "case-1",
    compositionHash: "hash-1",
    expected: snapshot,
    format: "feed",
    profileId: "ferreteria-producto-limpio",
    technicalBaselinePassed: false,
  });

  assert.equal(
    result.checks
      .filter((entry) => entry.group === "factual")
      .every((entry) => entry.passed),
    true,
  );
  assert.equal(result.passed, false);
  assert.equal(summarizeImageQuality([result]).technicalSuccess, 0);
});

test("un precio factual incorrecto rechaza una pieza aunque lo demás apruebe", () => {
  const result = scoreImageQualityCase({
    actual: { ...snapshot, price: "$ 25.400" },
    caseId: "factual-regression",
    compositionHash: "hash-1",
    expected: snapshot,
    format: "feed",
    profileId: "ferreteria-producto-limpio",
    technicalBaselinePassed: true,
  });

  assert.equal(result.passed, false);
  assert.equal(
    result.checks.find((entry) => entry.name === "price")?.passed,
    false,
  );
  assert.equal(summarizeImageQuality([result]).blockingFailures, 1);
});

function baseline(
  override: Partial<ImageQualityBaseline> = {},
): ImageQualityBaseline {
  const caseResult = scoreImageQualityCase({
    actual: snapshot,
    caseId: "case-1",
    compositionHash: "hash-1",
    expected: snapshot,
    format: "feed",
    profileId: "ferreteria-producto-limpio",
    technicalBaselinePassed: true,
  });
  return {
    cases: [caseResult],
    compositionVersion: "composition-v1",
    datasetVersion: "dataset-v1",
    generatedAt: "2026-08-07T12:00:00.000Z",
    humanReview: {
      assessments: [
        {
          caseId: "case-1",
          criticalFindings: [],
          scores: {
            "brand-coherence": 5,
            composition: 5,
            "context-relevance": 5,
            "mobile-legibility": 5,
            "product-fidelity": 5,
            "visual-hierarchy": 5,
          },
        },
      ],
      reviewedAt: "2026-08-07T13:00:00.000Z",
      reviewerRoles: ["business-owner", "visual-reviewer"],
      sampleCaseIds: ["case-1"],
      status: "approved",
    },
    metrics: summarizeImageQuality([caseResult]),
    model: "image-model-v1",
    profileVersion: "profile-v1",
    promptVersion: "prompt-v1",
    ...override,
  };
}

test("la puerta invalida prompt, perfil, modelo, composición y dataset", () => {
  const storedBaseline = baseline({
    compositionVersion: "old-composition",
    datasetVersion: "old-dataset",
    model: "old-model",
    profileVersion: "old-profile",
    promptVersion: "old-prompt",
  });
  const failures = checkImageQualityGate({
    baseline: storedBaseline,
    compositionVersion: "composition-v1",
    currentCases: storedBaseline.cases,
    datasetVersion: "dataset-v1",
    expectedCases: 1,
    expectedHumanSampleCaseIds: ["case-1"],
    model: "image-model-v1",
    profileVersion: "profile-v1",
    promptVersion: "prompt-v1",
  });

  assert.deepEqual(failures, [
    "stale-prompt",
    "stale-profile",
    "stale-model",
    "stale-composition",
    "stale-dataset",
  ]);
});

test("ningún resultado crítico se autoaprueba sin revisión humana", () => {
  const storedBaseline = baseline({
    humanReview: {
      assessments: [],
      reviewedAt: null,
      reviewerRoles: [],
      sampleCaseIds: ["case-1"],
      status: "pending",
    },
  });
  const failures = checkImageQualityGate({
    baseline: storedBaseline,
    compositionVersion: "composition-v1",
    currentCases: storedBaseline.cases,
    datasetVersion: "dataset-v1",
    expectedCases: 1,
    expectedHumanSampleCaseIds: ["case-1"],
    model: "image-model-v1",
    profileVersion: "profile-v1",
    promptVersion: "prompt-v1",
  });

  assert.deepEqual(failures, ["human-review-pending"]);
});

test("un cambio silencioso de composición invalida la línea base", () => {
  const storedBaseline = baseline();
  const currentCases = storedBaseline.cases.map((entry) => ({
    ...entry,
    compositionHash: "different-hash",
  }));

  const failures = checkImageQualityGate({
    baseline: storedBaseline,
    compositionVersion: "composition-v1",
    currentCases,
    datasetVersion: "dataset-v1",
    expectedCases: 1,
    expectedHumanSampleCaseIds: ["case-1"],
    model: "image-model-v1",
    profileVersion: "profile-v1",
    promptVersion: "prompt-v1",
  });

  assert.deepEqual(failures, ["baseline-drift"]);
});

test("un estado humano aprobado sin superar umbrales no abre el gate", () => {
  const storedBaseline = baseline({
    humanReview: {
      assessments: [
        {
          caseId: "case-1",
          criticalFindings: [],
          scores: {
            "brand-coherence": 5,
            composition: 5,
            "context-relevance": 5,
            "mobile-legibility": 2,
            "product-fidelity": 5,
            "visual-hierarchy": 5,
          },
        },
      ],
      reviewedAt: "2026-08-07T13:00:00.000Z",
      reviewerRoles: ["business-owner", "visual-reviewer"],
      sampleCaseIds: ["case-1"],
      status: "approved",
    },
  });

  const failures = checkImageQualityGate({
    baseline: storedBaseline,
    compositionVersion: "composition-v1",
    currentCases: storedBaseline.cases,
    datasetVersion: "dataset-v1",
    expectedCases: 1,
    expectedHumanSampleCaseIds: ["case-1"],
    model: "image-model-v1",
    profileVersion: "profile-v1",
    promptVersion: "prompt-v1",
  });

  assert.deepEqual(failures, ["human-review-incomplete"]);
});
