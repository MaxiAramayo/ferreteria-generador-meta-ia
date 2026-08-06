import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateImageCostMicrousd,
  generationPolicyDefaults,
  imageMaximumReservationMicrousd,
  imageReferenceCostMicrousd,
  normalizeGenerationPolicyUpdate,
} from "./generation-governance.ts";

test("la política piloto conserva los límites aprobados", () => {
  assert.deepEqual(generationPolicyDefaults, {
    enabled: true,
    generatedOrphanRetentionHours: 24,
    monthlyBudgetMicrousd: 20_000_000,
    organizationDailyAttemptLimit: 20,
    originalRetentionDays: 90,
    referenceRetentionDays: 30,
    timeZone: "UTC",
    userDailyAttemptLimit: 8,
    warningThresholdPercent: 80,
  });
});

test("el costo usa enteros micro-USD por modalidad", () => {
  assert.equal(
    estimateImageCostMicrousd({
      imageInputTokens: 40,
      inputTokens: 50,
      outputTokens: 50,
      textInputTokens: 10,
      totalTokens: 100,
    }),
    1_870,
  );
});

test("la referencia medium coincide con la tabla oficial", () => {
  assert.equal(imageReferenceCostMicrousd("1024x1024", "medium"), 53_000);
  assert.equal(imageReferenceCostMicrousd("1024x1536", "medium"), 41_000);
  assert.equal(imageReferenceCostMicrousd("1536x1024", "medium"), 41_000);
  assert.equal(imageMaximumReservationMicrousd("1024x1024", "medium"), 213_000);
});

test("la política rechaza presupuestos y retenciones fuera de rango", () => {
  assert.throws(
    () =>
      normalizeGenerationPolicyUpdate({
        ...generationPolicyDefaults,
        expectedVersion: 1,
        monthlyBudgetMicrousd: 0,
      }),
    /monthlyBudgetMicrousd/u,
  );
});
