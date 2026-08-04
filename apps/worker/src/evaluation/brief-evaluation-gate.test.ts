/**
 * Puerta de promoción.
 *
 * Corre dentro de `pnpm verify`, sin red. Si alguien cambia el prompt, el
 * esquema, el modelo por defecto o el dataset, la línea base congelada deja de
 * describir al sistema y esta prueba falla hasta que se vuelva a evaluar con
 * `NODE_ENV=staging pnpm brief:eval`.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  briefEvaluationThresholds,
  checkBriefEvaluationGate,
  type BriefEvaluationReport,
} from "@aramayo/domain";

import { contentBriefPromptHash } from "../brief/content-brief-prompt.ts";
import { contentBriefSchema } from "../brief/content-brief-schema.ts";
import { defaultBriefModel } from "../generation/openai-model-policy.ts";
import { briefEvaluationDatasetVersion } from "./brief-evaluation-dataset.ts";

const baselinePath = fileURLToPath(
  new URL("./brief-evaluation-baseline.json", import.meta.url),
);

async function readBaseline(): Promise<BriefEvaluationReport> {
  const raw = await readFile(baselinePath, "utf8");
  return JSON.parse(raw) as BriefEvaluationReport;
}

test("la línea base congelada corresponde al prompt, esquema, modelo y dataset vigentes", async () => {
  const baseline = await readBaseline();

  const failures = checkBriefEvaluationGate({
    baseline,
    datasetVersion: briefEvaluationDatasetVersion,
    model: defaultBriefModel,
    promptHash: contentBriefPromptHash,
    schemaVersion: contentBriefSchema.version,
  });

  assert.deepEqual(
    failures,
    [],
    `La evaluación congelada no habilita promover: ${failures.join(", ")}. Ejecutá NODE_ENV=staging pnpm brief:eval.`,
  );
});

test("la línea base supera los umbrales y no arrastra fallos bloqueantes", async () => {
  const baseline = await readBaseline();

  assert.ok(baseline.metrics.cases > 0);
  assert.equal(baseline.metrics.blockingFailures, 0);
  assert.ok(
    baseline.metrics.caseSuccess >= briefEvaluationThresholds.caseSuccess,
  );
  assert.ok(
    baseline.metrics.checkSuccess >= briefEvaluationThresholds.checkSuccess,
  );
});
