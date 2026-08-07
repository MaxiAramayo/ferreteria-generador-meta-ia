import assert from "node:assert/strict";
import test from "node:test";

import {
  checkImageQualityGate,
  scoreImageQualityCase,
  visualProfileIds,
} from "@aramayo/domain";

import { resolveVisualReferences } from "../visual/visual-asset-policy.ts";
import {
  imageQualityDataset,
  imageQualityEvaluationFormats,
  imageQualityHumanSampleCaseIds,
} from "./image-quality-evaluation-dataset.ts";
import {
  readImageQualityBaseline,
  runImageQualityEvaluation,
} from "./image-quality-evaluation.service.ts";

const evaluation = runImageQualityEvaluation("2026-08-07T12:00:00.000Z");

test("cubre seis perfiles, tres formatos y las cuatro categorías", () => {
  const dataset = imageQualityDataset();
  assert.equal(dataset.length, 18);
  assert.deepEqual(
    new Set(dataset.map((entry) => entry.profileId)),
    new Set(visualProfileIds),
  );
  assert.deepEqual(
    new Set(dataset.map((entry) => entry.format)),
    new Set(imageQualityEvaluationFormats),
  );
  assert.deepEqual(
    new Set(dataset.map((entry) => entry.category)),
    new Set(["institutional", "lubricant", "offer", "tool"]),
  );
  for (const profileId of visualProfileIds) {
    assert.equal(
      dataset.filter((entry) => entry.profileId === profileId).length,
      3,
    );
  }
  assert.deepEqual(
    dataset
      .filter((entry) => entry.reference.status === "missing")
      .map((entry) => entry.profileId),
    [
      "lubricentro-producto-limpio",
      "lubricentro-producto-limpio",
      "lubricentro-producto-limpio",
    ],
  );
  for (const entry of dataset) {
    if (entry.reference.status === "available") {
      assert.ok(entry.reference.assetId);
      assert.equal(
        resolveVisualReferences([
          {
            assetId: entry.reference.assetId,
            role: entry.reference.role,
          },
        ]).length,
        1,
      );
    }
  }
});

test("la corrida automática conserva todos los snapshots factuales", async () => {
  const report = await evaluation;
  assert.deepEqual(report.metrics, {
    blockingFailures: 0,
    caseSuccess: 1,
    cases: 18,
    factualSuccess: 1,
    technicalSuccess: 1,
  });
  assert.equal(
    report.cases.every((entry) => entry.passed),
    true,
  );
});

test("la baseline vigente bloquea solamente por revisión humana pendiente", async () => {
  const [baseline, current] = await Promise.all([
    readImageQualityBaseline(),
    evaluation,
  ]);
  const failures = checkImageQualityGate({
    baseline,
    compositionVersion: current.compositionVersion,
    currentCases: current.cases,
    datasetVersion: current.datasetVersion,
    expectedCases: 18,
    expectedHumanSampleCaseIds: imageQualityHumanSampleCaseIds,
    model: current.model,
    profileVersion: current.profileVersion,
    promptVersion: current.promptVersion,
  });

  assert.deepEqual(failures, ["human-review-pending"]);
});

test("una pieza con precio factual introducido a propósito se rechaza", () => {
  const entry = imageQualityDataset().find(
    (candidate) => candidate.category === "offer",
  );
  assert.ok(entry);
  const result = scoreImageQualityCase({
    actual: { ...entry.expected, price: "$ 50.900" },
    caseId: "deliberate-factual-error",
    expected: entry.expected,
    format: entry.format,
    overlayHash: "synthetic-regression",
    profileId: entry.profileId,
    technicalBaselinePassed: true,
  });

  assert.equal(result.passed, false);
  assert.equal(
    result.checks.find((check) => check.name === "price")?.passed,
    false,
  );
});

test("la muestra ciega toma dos piezas por perfil sin duplicados", () => {
  assert.equal(imageQualityHumanSampleCaseIds.length, 12);
  assert.equal(new Set(imageQualityHumanSampleCaseIds).size, 12);
  for (const profileId of visualProfileIds) {
    assert.equal(
      imageQualityHumanSampleCaseIds.filter((caseId) =>
        caseId.startsWith(`${profileId}-`),
      ).length,
      2,
    );
  }
});
