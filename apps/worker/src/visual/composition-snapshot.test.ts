import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  backgroundBytes,
  compositionBackgrounds,
  compositionBrief,
  compositionCases,
  sha256Of,
} from "./composition-snapshot-cases.ts";

/**
 * La suite visual necesita un navegador y corre con `pnpm composition:snapshot`.
 * Lo que se comprueba acá es lo que sostiene su valor y no necesita render: que
 * los fondos sean reproducibles, que el recorrido cubra lo que la tarea exige y
 * que la línea base congelada siga describiendo esos mismos casos.
 */

const manifestPath = fileURLToPath(
  new URL("../../composition-reference/manifest.json", import.meta.url),
);

test("el mismo fondo se fabrica igual en cada corrida", async () => {
  for (const background of compositionBackgrounds) {
    const first = await backgroundBytes(background);
    const second = await backgroundBytes(background);

    // Si los fondos no fueran reproducibles, el hash de la base cambiaría entre
    // máquinas y comparar contra una línea base no significaría nada.
    assert.equal(
      sha256Of(first),
      sha256Of(second),
      `El fondo ${background} no es reproducible.`,
    );
  }

  // Y son distintos entre sí: cuatro fondos iguales no probarían nada.
  const hashes = new Set<string>();
  for (const background of compositionBackgrounds) {
    hashes.add(sha256Of(await backgroundBytes(background)));
  }
  assert.equal(hashes.size, compositionBackgrounds.length);
});

test("el recorrido cubre las tres piezas en los tres formatos y los cuatro fondos", () => {
  const cases = compositionCases();
  const layouts = new Set(cases.map((entry) => entry.layout));
  const formats = new Set(cases.map((entry) => entry.format));

  assert.equal(layouts.size, 3);
  assert.deepEqual([...formats].sort(), ["cuadrado", "feed", "historia"]);
  // Tres piezas por tres formatos por cuatro fondos, más una corrida
  // determinista por pieza.
  assert.equal(cases.length, 3 * 3 * 4 + 3);
  assert.equal(
    cases.filter((entry) => entry.background === null).length,
    3,
    "Falta el camino determinista, que sale sin imagen del modelo.",
  );
  // Ningún identificador repetido: cada caso escribe su propio PNG.
  assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
});

test("el brief de la suite sustenta precio y vigencia con evidencia", () => {
  const priced = compositionBrief.verifiedFacts.filter(
    (fact) => fact.claimKind === "price",
  );
  const promoted = compositionBrief.verifiedFacts.filter(
    (fact) => fact.claimKind === "promotion",
  );

  assert.equal(priced.length, 1);
  assert.equal(promoted.length, 1);
  // Sin evidencia no hay dato que componer: la suite tiene que ejercer el
  // camino con precio, que es el que más puede romperse.
  assert.ok(priced.every((fact) => fact.evidenceId.length > 0));
});

test("la línea base congelada describe los mismos casos", async () => {
  const raw = await readFile(manifestPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const manifest = parsed as {
    readonly cases: readonly { readonly id: string }[];
    readonly task: string;
  };

  assert.equal(manifest.task, "P4-T05");
  assert.deepEqual(
    manifest.cases.map((entry) => entry.id).sort(),
    compositionCases()
      .map((entry) => entry.id)
      .sort(),
    "La línea base y el recorrido dejaron de coincidir: regenerá con pnpm composition:snapshot.",
  );
});
