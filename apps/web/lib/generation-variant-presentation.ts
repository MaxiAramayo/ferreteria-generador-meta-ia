import type {
  GenerationRunResponse,
  GenerationVariantResponse,
} from "@aramayo/contracts";

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

/** Estado de una ejecución de generación, como se lee en el linaje. */
export function generationRunStatusLabel(
  status: GenerationRunResponse["status"],
): string {
  switch (status) {
    case "pending":
      return "En cola";
    case "running":
      return "Generando";
    case "completed":
      return "Completa";
    case "failed":
      return "Falló";
    case "cancelled":
      return "Cancelada";
  }
}

/**
 * Cómo se produce la imagen de una variante. Nombra el método y no el
 * resultado: una variante descartada también es `generated` y nunca tuvo
 * imagen. La base sólo admite `generated` y `deterministic`; un valor
 * desconocido se nombra sin inventarle un origen.
 */
export function generationVariantSourceLabel(source: string): string {
  switch (source) {
    case "generated":
      return "Imagen con IA";
    case "deterministic":
      return "Composición de marca";
    default:
      return "Origen sin identificar";
  }
}

/**
 * Qué decir en lugar de la pieza cuando todavía no hay una.
 *
 * Una variante descartada nunca se intentó: el lote terminó antes de llegar a
 * ella y no gastó nada. Presentarla como pendiente o como falla sugeriría algo
 * que no pasó.
 */
export function generationVariantPlaceholder(
  variant: GenerationVariantResponse,
): Readonly<{ detail: string; title: string }> {
  switch (variant.status) {
    case "pending":
      return { detail: "Todavía se está preparando.", title: "En preparación" };
    case "failed":
      return {
        detail:
          variant.failure?.correction ??
          "No se pudo generar y no llegó un motivo.",
        title: "No se pudo generar",
      };
    case "discarded":
      return {
        detail:
          variant.failure?.correction ??
          "El lote terminó antes de llegar a esta variante: no se generó y no tuvo costo.",
        title: "Sin generar",
      };
    case "succeeded":
      return {
        detail: "La imagen está lista, pero la pieza todavía no se compuso.",
        title: "Sin componer",
      };
  }
}
