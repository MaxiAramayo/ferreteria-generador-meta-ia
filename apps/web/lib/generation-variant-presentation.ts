import type { GenerationVariantResponse } from "@aramayo/contracts";

export type GenerationVariantAction =
  "compare" | "edit-factual" | "edit-visual" | "select";

export function availableGenerationVariantActions(
  variant: GenerationVariantResponse,
): ReadonlySet<GenerationVariantAction> {
  if (variant.status !== "succeeded" || variant.composition === null) {
    return new Set();
  }
  const actions = new Set<GenerationVariantAction>([
    "compare",
    "edit-factual",
    "select",
  ]);
  if (variant.source === "generated" && variant.mediaAssetId !== null) {
    actions.add("edit-visual");
  }
  return actions;
}
