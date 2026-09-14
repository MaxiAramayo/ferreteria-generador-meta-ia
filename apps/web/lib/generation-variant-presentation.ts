import type { GenerationVariantResponse } from "@aramayo/contracts";

export type GenerationVariantAction =
  "compare" | "edit-composition" | "edit-factual" | "edit-visual" | "select";

export function availableGenerationVariantActions(
  variant: GenerationVariantResponse,
): ReadonlySet<GenerationVariantAction> {
  if (variant.status !== "succeeded" || variant.composition === null) {
    return new Set();
  }
  const actions = new Set<GenerationVariantAction>([
    "compare",
    // Cambiar de marco y textos no depende de si hubo imagen generada: una
    // pieza determinista también se puede recomponer con otro marco.
    "edit-composition",
    "edit-factual",
    "select",
  ]);
  if (variant.source === "generated" && variant.mediaAssetId !== null) {
    actions.add("edit-visual");
  }
  return actions;
}
