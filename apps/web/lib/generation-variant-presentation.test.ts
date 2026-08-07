import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationVariantResponse } from "@aramayo/contracts";

import { availableGenerationVariantActions } from "./generation-variant-presentation.ts";

function variant(
  status: GenerationVariantResponse["status"],
  source = "generated",
): GenerationVariantResponse {
  return {
    composition:
      status === "succeeded"
        ? {
            compositionHash: "a".repeat(64),
            height: 1350,
            layout: "composicion-tercio-inferior",
            mediaAssetId: "media-composition",
            previewUrl: "https://media.invalid/composition.png",
            theme: "taller",
            version: "visual-composition/2026-08-05.1",
            width: 1080,
          }
        : null,
    failure:
      status === "failed"
        ? { code: "provider-error", correction: "Reintentá más tarde." }
        : null,
    height: status === "succeeded" ? 1536 : null,
    id: "variant-1",
    index: 0,
    mediaAssetId: status === "succeeded" ? "media-base" : null,
    source,
    status,
    width: status === "succeeded" ? 1024 : null,
  };
}

test("las variantes fallidas no exponen acciones que no pueden completar", () => {
  assert.equal(availableGenerationVariantActions(variant("failed")).size, 0);
  assert.equal(availableGenerationVariantActions(variant("pending")).size, 0);
});

test("una pieza determinista se compara y selecciona, pero no edita píxeles", () => {
  const actions = availableGenerationVariantActions(
    variant("succeeded", "deterministic"),
  );
  assert.deepEqual([...actions], ["compare", "edit-factual", "select"]);
});

test("una base generada habilita la edición visual controlada", () => {
  assert.equal(
    availableGenerationVariantActions(variant("succeeded")).has("edit-visual"),
    true,
  );
});
