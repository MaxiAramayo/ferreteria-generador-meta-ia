import assert from "node:assert/strict";
import { test } from "node:test";

import { imageCreativePrototypeCases } from "./image-creative-prototypes.ts";

test("la muestra contiene tres conceptos en historia y feed", () => {
  const cases = imageCreativePrototypeCases();

  assert.equal(cases.length, 6);
  assert.equal(
    cases.filter(({ document }) => document.format === "feed").length,
    3,
  );
  assert.equal(
    cases.filter(({ document }) => document.format === "historia").length,
    3,
  );

  for (const family of [
    "product-price",
    "problem-solution",
    "real-assortment",
  ] as const) {
    const familyCases = cases.filter((entry) => entry.family === family);
    assert.equal(familyCases.length, 2);
    assert.deepEqual(
      familyCases.map(({ document }) => document.format).sort(),
      ["feed", "historia"],
    );
  }
});

test("ningún precio sintético puede confundirse con una pieza publicable", () => {
  for (const prototypeCase of imageCreativePrototypeCases()) {
    assert.equal(prototypeCase.publishable, false);
    assert.ok(prototypeCase.document.content.price);
    assert.match(prototypeCase.document.content.validity ?? "", /NO PUBLICAR/u);
    assert.ok(prototypeCase.document.content.disclaimer);
  }
});

test("los seis prototipos usan sólo activos propios y no necesitan red ni IA", () => {
  for (const { document } of imageCreativePrototypeCases()) {
    assert.ok(document.media.length > 0);
    for (const asset of document.media) {
      assert.equal(asset.reference.source, "brand-library");
    }
  }
});
