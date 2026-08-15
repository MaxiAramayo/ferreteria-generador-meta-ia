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

test("la ficha usa dos medidas recuperadas de Odoo y sigue bloqueada para publicar", () => {
  const variants = imageCreativePrototypeCases().filter(
    ({ family }) => family === "variant-sheet",
  );

  for (const prototypeCase of variants) {
    assert.deepEqual(prototypeCase.document.content.items, [
      "1/2″ · SKU 1670",
      "3/4″ · SKU 1671",
    ]);
    assert.equal(prototypeCase.publishable, false);
    assert.match(prototypeCase.document.content.disclaimer ?? "", /SKU/u);
    assert.deepEqual(prototypeCase.catalogEvidence, {
      observedAt: "2026-08-12T23:18:41.000Z",
      products: [
        {
          externalId: "odoo-product-7915",
          measure: "1/2″",
          name: "ESPIGA TEE 1/2",
          sku: "1670",
        },
        {
          externalId: "odoo-product-7916",
          measure: "3/4″",
          name: "ESPIGA TEE 3/4 POLIETILENO",
          sku: "1671",
        },
      ],
      query: "tee",
      reference: "odoo:product.product:search",
      requestId: "fe794c7e-f168-49ea-a025-6e446b6389e4",
      scope: "product-identity-and-measure",
      sourceKind: "odoo",
    });
  }
});

test("la guía no presenta su explicación de uso como un dato de catálogo", () => {
  const applications = imageCreativePrototypeCases().filter(
    ({ family }) => family === "application-guide",
  );

  for (const prototypeCase of applications) {
    assert.equal(prototypeCase.catalogEvidence, null);
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
