import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generationRunLimits,
  generationRunOutcome,
  generationRunProgress,
  generationRunStatuses,
  generationVariantStatuses,
  isGenerationRunResolved,
  isGenerationRunTransitionAllowed,
  type GenerationRunStatus,
  type GenerationVariantRecord,
  type GenerationVariantStatus,
} from "./generation-run.ts";

function variant(
  index: number,
  status: GenerationVariantStatus,
): GenerationVariantRecord {
  return {
    attempts: status === "pending" || status === "discarded" ? 0 : 1,
    completedAt: status === "pending" ? null : "2026-08-03T12:00:00.000Z",
    // Toda variante que salió lleva su pieza compuesta: se escribe junto al
    // resultado, porque componer necesita los bytes de la base.
    composition:
      status === "succeeded"
        ? {
            compositionHash: "c".repeat(64),
            height: 1350,
            layout: "composicion-tercio-inferior",
            mediaAssetId: `33333333-3333-4333-8333-00000000000${String(index)}`,
            overlayHash: "d".repeat(64),
            sha256: "e".repeat(64),
            theme: "taller",
            version: "visual-composition/2026-08-05.1",
            width: 1080,
          }
        : null,
    failure:
      status === "failed"
        ? {
            code: "rate-limit",
            correction: "Reintentá el lote en unos minutos.",
            detail: "El proveedor limitó la tasa.",
          }
        : null,
    height: status === "succeeded" ? 1536 : null,
    id: `11111111-1111-4111-8111-00000000000${String(index)}`,
    index,
    latencyMilliseconds: status === "succeeded" ? 4_000 : 0,
    mediaAssetId:
      status === "succeeded"
        ? `22222222-2222-4222-8222-00000000000${String(index)}`
        : null,
    model: status === "succeeded" ? "gpt-image-1" : null,
    source: "generated" as const,
    requestId: null,
    sha256: status === "succeeded" ? "a".repeat(64) : null,
    status,
    width: status === "succeeded" ? 1024 : null,
  };
}

describe("ciclo de vida de la ejecución de generación", () => {
  it("sólo admite las transiciones que describen un lote real", () => {
    assert.ok(isGenerationRunTransitionAllowed("pending", "running"));
    assert.ok(isGenerationRunTransitionAllowed("pending", "cancelled"));
    // Un lote puede fallar sin ejecutarse: el plan se resolvió determinista o
    // el pedido no sobrevivió a la validación previa.
    assert.ok(isGenerationRunTransitionAllowed("pending", "failed"));
    assert.ok(isGenerationRunTransitionAllowed("running", "completed"));
    assert.ok(isGenerationRunTransitionAllowed("running", "cancelled"));

    // Un lote nunca vuelve atrás ni se reabre; reintentar crea otra ejecución.
    assert.ok(!isGenerationRunTransitionAllowed("pending", "completed"));
    assert.ok(!isGenerationRunTransitionAllowed("running", "pending"));
    assert.ok(!isGenerationRunTransitionAllowed("cancelled", "running"));
    assert.ok(!isGenerationRunTransitionAllowed("completed", "failed"));
    assert.ok(!isGenerationRunTransitionAllowed("failed", "running"));
  });

  it("reconoce como resueltos exactamente los tres estados terminales", () => {
    const resolved = generationRunStatuses.filter((status) =>
      isGenerationRunResolved(status),
    );
    assert.deepEqual([...resolved], ["completed", "failed", "cancelled"]);
  });

  it("ningún estado terminal admite salidas", () => {
    for (const status of generationRunStatuses) {
      if (!isGenerationRunResolved(status)) {
        continue;
      }
      for (const target of generationRunStatuses) {
        assert.ok(
          !isGenerationRunTransitionAllowed(status, target),
          `${status} no puede pasar a ${target}`,
        );
      }
    }
  });
});

describe("progreso del lote", () => {
  it("cuenta cada variante en su casillero", () => {
    const progress = generationRunProgress([
      variant(0, "succeeded"),
      variant(1, "failed"),
      variant(2, "pending"),
      variant(3, "discarded"),
    ]);
    assert.deepEqual(progress, {
      discarded: 1,
      failed: 1,
      pending: 1,
      succeeded: 1,
      total: 4,
    });
  });

  it("cubre todos los estados de variante que existen", () => {
    const progress = generationRunProgress(
      generationVariantStatuses.map((status, index) => variant(index, status)),
    );
    // Si apareciera un estado nuevo sin contarse, el total dejaría de cerrar.
    assert.equal(
      progress.discarded +
        progress.failed +
        progress.pending +
        progress.succeeded,
      progress.total,
    );
    assert.equal(progress.total, generationVariantStatuses.length);
  });

  it("un lote vacío no rompe el conteo", () => {
    assert.deepEqual(generationRunProgress([]), {
      discarded: 0,
      failed: 0,
      pending: 0,
      succeeded: 0,
      total: 0,
    });
  });
});

describe("resultado del lote", () => {
  it("una sola variante viva alcanza para que el lote sirva", () => {
    assert.equal(
      generationRunOutcome([variant(0, "failed"), variant(1, "succeeded")]),
      "completed",
    );
  });

  it("sin ninguna variante utilizable el lote falla", () => {
    assert.equal(
      generationRunOutcome([variant(0, "failed"), variant(1, "discarded")]),
      "failed",
    );
  });

  it("un lote sin variantes falla en lugar de darse por bueno", () => {
    assert.equal(generationRunOutcome([]), "failed");
  });
});

describe("límites del lote", () => {
  it("el techo de variantes es una barrera de gasto, no una preferencia", () => {
    // Subir el techo es una decisión de gasto, no un ajuste: esta prueba
    // obliga a tomarla explícitamente en lugar de deslizarla.
    assert.equal(generationRunLimits.variantsMinimum, 1);
    assert.equal(generationRunLimits.variantsMaximum, 4);
  });
});

describe("estados declarados", () => {
  it("no hay estados duplicados", () => {
    const unique = new Set<GenerationRunStatus>(generationRunStatuses);
    assert.equal(unique.size, generationRunStatuses.length);
  });
});
