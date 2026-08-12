import assert from "node:assert/strict";
import { test } from "node:test";

import { imageCreativePrototypeCases } from "./image-creative-prototypes.ts";

test("la muestra contiene dos conceptos en historia y feed", () => {
  const cases = imageCreativePrototypeCases();

  assert.equal(cases.length, 4);
  assert.equal(
    cases.filter(({ document }) => document.format === "feed").length,
    2,
  );
  assert.equal(
    cases.filter(({ document }) => document.format === "historia").length,
    2,
  );

  for (const family of ["application-guide", "variant-sheet"] as const) {
    const familyCases = cases.filter((entry) => entry.family === family);
    assert.equal(familyCases.length, 2);
    assert.deepEqual(
      familyCases.map(({ document }) => document.format).sort(),
      ["feed", "historia"],
    );
  }
});

test("la muestra no inventa precios ni condiciones de venta", () => {
  for (const prototypeCase of imageCreativePrototypeCases()) {
    assert.equal(prototypeCase.publishable, false);
    assert.equal(prototypeCase.document.content.price, undefined);
    assert.equal(prototypeCase.document.content.validity, undefined);
    assert.ok(prototypeCase.document.content.disclaimer);
  }
});

test("la ficha usa tres medidas de referencia y sigue bloqueada para publicar", () => {
  const variants = imageCreativePrototypeCases().filter(
    ({ family }) => family === "variant-sheet",
  );

  for (const prototypeCase of variants) {
    assert.deepEqual(prototypeCase.document.content.items, [
      "1/2″",
      "3/4″",
      "1″",
    ]);
    assert.equal(prototypeCase.publishable, false);
    assert.match(prototypeCase.document.content.disclaimer ?? "", /MUESTRA/u);
  }
});

test("la guía explicita que la manguera envuelve la espiga", () => {
  const applications = imageCreativePrototypeCases().filter(
    ({ family }) => family === "application-guide",
  );

  for (const prototypeCase of applications) {
    assert.match(prototypeCase.document.content.title, /POR FUERA/iu);
    assert.ok(
      prototypeCase.document.content.items?.includes(
        "Deslizá la manguera por fuera",
      ),
    );
  }
});

test("los prototipos usan bases IA embebidas y no necesitan red al renderizar", () => {
  for (const { document } of imageCreativePrototypeCases()) {
    assert.equal(document.media.length, 1);
    for (const asset of document.media) {
      assert.equal(asset.reference.source, "inline");
    }
  }
});
