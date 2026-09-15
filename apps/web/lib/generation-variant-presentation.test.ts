import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationVariantResponse } from "@aramayo/contracts";

import {
  availableGenerationVariantActions,
  generationRunStatusLabel,
  generationVariantPlaceholder,
  generationVariantSourceLabel,
} from "./generation-variant-presentation.ts";

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

test("una pieza determinista se compara, recompone y selecciona, pero no edita píxeles", () => {
  const actions = availableGenerationVariantActions(
    variant("succeeded", "deterministic"),
  );
  assert.deepEqual(
    [...actions],
    ["compare", "edit-composition", "edit-factual", "select"],
  );
});

test("una base generada habilita la edición visual controlada", () => {
  assert.equal(
    availableGenerationVariantActions(variant("succeeded")).has("edit-visual"),
    true,
  );
});

test("el estado y el origen de cada variante se leen en castellano", () => {
  assert.equal(generationRunStatusLabel("completed"), "Completa");
  assert.equal(generationRunStatusLabel("pending"), "En cola");
  assert.equal(
    generationVariantSourceLabel("deterministic"),
    "Composición de marca",
  );
  assert.equal(generationVariantSourceLabel("generated"), "Imagen generada");
  assert.equal(
    generationVariantSourceLabel("desconocido"),
    "Origen sin identificar",
  );
});

test("una variante descartada no se presenta como pendiente ni como falla", () => {
  const discarded = generationVariantPlaceholder(variant("discarded"));
  assert.equal(discarded.title, "Sin generar");
  assert.match(discarded.detail, /no tuvo costo/u);
  assert.doesNotMatch(discarded.detail, /todavía/u);
  assert.equal(
    generationVariantPlaceholder(variant("failed")).detail,
    "Reintentá más tarde.",
  );
  assert.equal(
    generationVariantPlaceholder(variant("pending")).title,
    "En preparación",
  );
});
