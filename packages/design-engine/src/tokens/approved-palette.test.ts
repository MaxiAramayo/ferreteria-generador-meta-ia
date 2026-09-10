import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { COLORS } from "./colors.ts";

/**
 * La paleta aprobada no cambia por accidente (`P7-T02`).
 *
 * Se descubrió midiendo: cambiar `ferre` de `#e63b1e` a otro color no hacía
 * fallar nada. `baseline:verify` confirma que los PNG de referencia siguen
 * íntegros —no que el motor siga pintando igual— y ninguna prueba de
 * composición mira el color resultante.
 *
 * Esta prueba no reemplaza una regresión visual sobre la imagen renderizada;
 * cierra el agujero concreto: la paleta es la decisión de marca más barata de
 * romper y la más cara de descubrir tarde. Cambiarla ahora obliga a actualizar
 * la huella en el mismo commit, que es exactamente la revisión que faltaba.
 */

const approvedPaletteFingerprint =
  "bf70d43635924c89b14a5d09eba164025664a3e7954991723097d3d0aba6a79d";

test("la paleta aprobada conserva su huella", () => {
  const canonical = Object.entries(COLORS)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join(",");

  assert.equal(
    createHash("sha256").update(canonical).digest("hex"),
    approvedPaletteFingerprint,
    `La paleta cambió. Si el cambio es deliberado, actualizá la huella en el mismo commit:\n${canonical}`,
  );
});

test("ningún color aprobado se repite bajo dos nombres sin serlo a propósito", () => {
  // `rust` y `ferre` comparten valor, igual que `safety` y `lubri`: son alias
  // heredados del generador congelado y se conservan a propósito.
  const expectedAliases = new Map([
    ["#b62a12", ["ferreDeep", "rustDeep"]],
    ["#e59400", ["lubriDeep", "safetyDeep"]],
    ["#e63b1e", ["ferre", "rust"]],
    ["#ffb200", ["lubri", "safety"]],
  ]);

  const byValue = new Map<string, string[]>();
  for (const [name, value] of Object.entries(COLORS)) {
    byValue.set(value, [...(byValue.get(value) ?? []), name].toSorted());
  }

  assert.deepEqual(
    [...byValue.entries()]
      .filter(([, names]) => names.length > 1)
      .toSorted(([left], [right]) => left.localeCompare(right)),
    [...expectedAliases.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
});
