import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DesignEngineError } from "../contracts/errors.ts";
import { BRAND_ASSETS } from "./asset-library.ts";
import { findBrandAsset, resolveAssetUrl } from "./asset-resolver.ts";

/**
 * La biblioteca migrada debe seguir siendo idéntica a la línea base: si un
 * archivo se reemplaza o se corrompe, el hash deja de coincidir y la prueba
 * falla sin necesidad del generador original.
 */

const assetsUrl = new URL("../../assets/", import.meta.url);

test("todos los activos registrados existen y conservan su hash", () => {
  assert.equal(BRAND_ASSETS.length, 38);

  for (const asset of BRAND_ASSETS) {
    const content = readFileSync(new URL(asset.file, assetsUrl));
    const digest = createHash("sha256").update(content).digest("hex");

    assert.equal(
      digest,
      asset.sha256,
      `El activo ${asset.assetId} no coincide con la línea base.`,
    );
    assert.equal(content.byteLength, asset.bytes);
  }
});

test("cada activo declara su confirmación de propiedad", () => {
  for (const asset of BRAND_ASSETS) {
    assert.match(asset.ownershipNote, /Material propio/u);
  }
});

test("los identificadores son únicos y usables como referencia", () => {
  const identifiers = new Set(BRAND_ASSETS.map((asset) => asset.assetId));

  assert.equal(identifiers.size, BRAND_ASSETS.length);
  for (const asset of BRAND_ASSETS) {
    assert.match(asset.assetId, /^[a-z0-9][a-z0-9/_-]{2,127}$/u);
  }
});

test("una referencia aprobada se resuelve contra la base pública", () => {
  const [asset] = BRAND_ASSETS;
  assert.ok(asset);

  const url = resolveAssetUrl(
    { assetId: asset.assetId, source: "brand-library" },
    { assetBaseUrl: "https://panel.example/media" },
  );

  assert.equal(url, `https://panel.example/media/${asset.file}`);
});

test("una referencia remota se conserva tal cual", () => {
  assert.equal(
    resolveAssetUrl(
      { source: "remote", url: "https://cdn.example/foto.jpg" },
      { assetBaseUrl: "https://panel.example/media" },
    ),
    "https://cdn.example/foto.jpg",
  );
});

test("un activo inexistente detiene la composición con un error de etapa", () => {
  assert.equal(findBrandAsset("foto-que-no-existe"), undefined);

  assert.throws(
    () => {
      resolveAssetUrl(
        { assetId: "foto-que-no-existe", source: "brand-library" },
        { assetBaseUrl: "https://panel.example/media" },
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof DesignEngineError);
      assert.equal(error.failure.stage, "asset");
      assert.equal(error.failure.reason, "not-found");
      return true;
    },
  );
});
