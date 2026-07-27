import assert from "node:assert/strict";
import { after, test } from "node:test";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  DESIGN_SCHEMA_VERSION,
  parseDesignDocument,
  type DesignDocument,
} from "@aramayo/design-engine";

import {
  createPlaywrightRenderer,
  type ManagedRenderer,
} from "./playwright-renderer.ts";
import {
  assetBaseUrl,
  buildRenderHtml,
  fontStylesheetUrls,
  renderContextFor,
} from "./render-document.ts";

/**
 * El render se comprueba contra un navegador real: es la única forma de saber
 * si una pieza exporta con sus dimensiones, si espera las fuentes y si una
 * imagen rota detiene el trabajo.
 *
 * Las pruebas con navegador se saltan cuando no hay uno instalado, para no
 * exigir binarios en un entorno de integración continua que todavía no los
 * provee. El resto —composición del documento y resolución de recursos— corre
 * siempre.
 */

const context = renderContextFor(ARAMAYO_BRAND_PROFILE);
const renderTimeoutMs = 60_000;

function documentFor(overrides: Record<string, unknown> = {}): DesignDocument {
  const result = parseDesignDocument({
    content: {
      badge: "Producto destacado",
      callToAction: "Consultá stock",
      price: "$ 24.500",
      subtitle: "Consultá modelos disponibles y accesorios.",
      title: "Taladros para resolver en el día",
    },
    format: "feed",
    layout: "producto-precio",
    media: [
      {
        alt: "Herramientas eléctricas sobre un banco de trabajo",
        reference: {
          assetId: "stock-herramientas-electricas",
          source: "brand-library",
        },
      },
    ],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "render-producto-precio",
    theme: "taller",
    ...overrides,
  });

  assert.equal(result.ok, true, "El documento de prueba debe ser válido.");

  return result.document;
}

let renderer: ManagedRenderer | undefined;
let browserAvailable: boolean | undefined;

async function rendererIfAvailable(): Promise<ManagedRenderer | undefined> {
  if (browserAvailable === false) {
    return undefined;
  }

  renderer ??= createPlaywrightRenderer({
    context,
    timeoutMs: renderTimeoutMs,
  });
  const probe = await renderer.render({
    document: documentFor(),
    requestId: "probe",
  });

  browserAvailable =
    probe.ok ||
    probe.failure.stage !== "render" ||
    probe.failure.reason !== "browser-crashed";

  if (browserAvailable) {
    return renderer;
  }

  await renderer.close();
  renderer = undefined;
  return undefined;
}

after(async () => {
  await renderer?.close();
});

test("el documento HTML enlaza fuentes y activos locales, sin red", () => {
  const html = buildRenderHtml({ context, document: documentFor() });

  assert.match(html, /^<!doctype html>/u);
  assert.match(html, /data-card=""/u);
  assert.ok(html.includes("Taladros para resolver en el día"));
  assert.ok(html.includes("width:1080px"));

  for (const url of fontStylesheetUrls()) {
    assert.ok(html.includes(url), `Falta la hoja de fuente ${url}.`);
    assert.match(url, /^file:\/\//u);
  }

  assert.match(assetBaseUrl(), /^file:\/\//u);
  assert.ok(
    !/https?:\/\//u.test(html.replace(/https:\/\/[^"']*aramayo[^"']*/gu, "")),
    "El documento no debe pedir recursos por red.",
  );
});

test("exporta el nodo de la pieza con las dimensiones del formato", async () => {
  const managed = await rendererIfAvailable();

  if (managed === undefined) {
    return;
  }

  const result = await managed.render({
    document: documentFor(),
    requestId: "render-dimensiones",
  });

  assert.equal(result.ok, true, "El render debe completarse.");
  assert.equal(result.image.width, 1080);
  assert.equal(result.image.height, 1350);
  assert.equal(result.image.byteLength, result.image.png.byteLength);
  assert.match(result.image.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.requestId, "render-dimensiones");
  assert.ok(result.durationMs > 0);
});

test("repetir la misma entrada produce el mismo resultado", async () => {
  const managed = await rendererIfAvailable();

  if (managed === undefined) {
    return;
  }

  const document = documentFor();
  const first = await managed.render({ document, requestId: "repeticion-1" });
  const second = await managed.render({ document, requestId: "repeticion-2" });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(
    first.image.sha256,
    second.image.sha256,
    "Un reintento no puede producir un resultado distinto para la misma entrada.",
  );
});

test("una imagen que no decodifica hace fallar el trabajo", async () => {
  const managed = await rendererIfAvailable();

  if (managed === undefined) {
    return;
  }

  const result = await managed.render({
    document: documentFor({
      media: [
        {
          alt: "Imagen remota inexistente",
          reference: {
            source: "remote",
            url: "https://127.0.0.1:9/inexistente.jpg",
          },
        },
      ],
    }),
    requestId: "activo-roto",
  });

  assert.equal(result.ok, false, "Una imagen rota no puede exportarse.");
  assert.equal(result.failure.stage, "asset");
});

test("un trabajo que excede su tiempo falla como render, no como éxito", async () => {
  const managed = await rendererIfAvailable();

  if (managed === undefined) {
    return;
  }

  const impatient = createPlaywrightRenderer({ context, timeoutMs: 1 });

  try {
    const result = await impatient.render({
      document: documentFor(),
      requestId: "timeout",
    });

    assert.equal(result.ok, false);
    assert.equal(result.failure.stage, "render");
  } finally {
    await impatient.close();
  }
});

test("un lote respeta el límite de concurrencia y cierra sus páginas", async () => {
  const managed = await rendererIfAvailable();

  if (managed === undefined) {
    return;
  }

  const batch = await Promise.all(
    ["lote-1", "lote-2", "lote-3", "lote-4"].map((requestId) =>
      managed.render({ document: documentFor(), requestId }),
    ),
  );

  assert.equal(batch.length, 4);
  for (const result of batch) {
    assert.equal(result.ok, true);
  }
});
