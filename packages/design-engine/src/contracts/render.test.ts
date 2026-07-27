import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDesignDocument } from "../validation/parse-document.ts";
import { DESIGN_SCHEMA_VERSION, type DesignDocument } from "./document.ts";
import { DesignEngineError, type DesignFailure } from "./errors.ts";
import type { DesignRenderer, RenderRequest, RenderResult } from "./render.ts";

/**
 * Consumidor de ejemplo del contrato.
 *
 * Implementa el puerto de render sin navegador ni sistema de archivos: si esta
 * prueba compila y pasa, la API pública es consumible desde el worker sin
 * arrastrar infraestructura al dominio.
 */

function documentFor(slug: string): DesignDocument {
  const result = parseDesignDocument({
    content: { title: "Ofertas de la semana" },
    format: "historia",
    layout: "historia-preguntas",
    media: [],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug,
    theme: "promo",
  });

  assert.equal(result.ok, true, "El documento de ejemplo debe ser válido.");

  return result.document;
}

class StubRenderer implements DesignRenderer {
  readonly #failure: DesignFailure | undefined;

  constructor(failure?: DesignFailure) {
    this.#failure = failure;
  }

  render(request: RenderRequest): Promise<RenderResult> {
    if (this.#failure !== undefined) {
      return Promise.resolve({
        durationMs: 12,
        failure: this.#failure,
        ok: false,
        requestId: request.requestId,
      });
    }

    const png = Uint8Array.of(137, 80, 78, 71);

    return Promise.resolve({
      durationMs: 42,
      image: {
        byteLength: png.byteLength,
        height: 1920,
        png,
        sha256: "0".repeat(64),
        width: 1080,
      },
      ok: true,
      requestId: request.requestId,
    });
  }
}

test("un render exitoso devuelve imagen, dimensiones y correlación", async () => {
  const renderer: DesignRenderer = new StubRenderer();
  const result = await renderer.render({
    document: documentFor("historia-preguntas-semana"),
    requestId: "render-001",
  });

  assert.equal(result.ok, true);
  assert.equal(result.requestId, "render-001");
  assert.equal(result.image.width, 1080);
  assert.equal(result.image.height, 1920);
  assert.equal(result.image.byteLength, result.image.png.byteLength);
});

test("un fallo de activo se distingue de uno de render por su etapa", async () => {
  const assetRenderer: DesignRenderer = new StubRenderer({
    assetReference: "brand-library:foto-vencida",
    reason: "decode-failed",
    stage: "asset",
  });
  const assetResult = await assetRenderer.render({
    document: documentFor("historia-preguntas-activo"),
    requestId: "render-002",
  });

  assert.equal(assetResult.ok, false);
  assert.equal(assetResult.failure.stage, "asset");

  const renderRenderer: DesignRenderer = new StubRenderer({
    durationMs: 30_000,
    reason: "timeout",
    stage: "render",
  });
  const renderResult = await renderRenderer.render({
    document: documentFor("historia-preguntas-timeout"),
    requestId: "render-003",
  });

  assert.equal(renderResult.ok, false);
  assert.equal(renderResult.failure.stage, "render");
});

test("el error transportable conserva el fallo estructurado", () => {
  const error = new DesignEngineError(
    {
      layout: "historia-preguntas",
      reason: "format-not-supported",
      stage: "layout",
    },
    "El layout no admite el formato solicitado.",
  );

  assert.equal(error.name, "DesignEngineError");
  assert.equal(error.failure.stage, "layout");
  assert.ok(error instanceof Error);
});
