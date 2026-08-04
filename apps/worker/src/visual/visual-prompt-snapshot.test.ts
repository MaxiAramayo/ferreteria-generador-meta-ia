/**
 * Snapshots de prompt para briefs representativos.
 *
 * El baseline es evidencia, no decoración: fija qué se le pide al proveedor para
 * cada campaña del catálogo inicial. Un cambio de perfil, de instrucciones o del
 * constructor mueve estos hashes, y moverlos obliga a mirar el prompt nuevo
 * antes de promoverlo en lugar de descubrir el cambio en la imagen.
 *
 * Para actualizarlo a propósito:
 *
 * ```bash
 * pnpm visual:snapshot
 * ```
 *
 * Ese comando reescribe el JSON en el repositorio; el diff es lo que se revisa
 * antes de aceptar el cambio.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { visualPromptSnapshots } from "./visual-prompt-snapshot-cases.ts";

interface SnapshotBaselineEntry {
  readonly format: string;
  readonly id: string;
  readonly kind: string;
  readonly negativeGuidance: readonly string[];
  readonly profileId: string | null;
  readonly profileVersion: string | null;
  readonly prompt: string | null;
  readonly promptHash: string | null;
  readonly reason: string | null;
  readonly reservedSpace: string | null;
}

interface SnapshotBaseline {
  readonly cases: readonly SnapshotBaselineEntry[];
  readonly instructionsHash: string;
  readonly promptVersion: string;
}

const baseline = JSON.parse(
  readFileSync(
    new URL("./visual-prompt-baseline.json", import.meta.url),
    "utf8",
  ),
) as SnapshotBaseline;

test("el baseline cubre exactamente los casos representativos", () => {
  assert.deepEqual(
    baseline.cases.map((entry) => entry.id),
    visualPromptSnapshots().map((entry) => entry.id),
  );
});

test("las instrucciones y su versión no cambiaron sin actualizar el baseline", () => {
  const current = visualPromptSnapshots();
  assert.equal(baseline.promptVersion, current[0]?.promptVersion);
  assert.equal(baseline.instructionsHash, current[0]?.instructionsHash);
});

test("cada brief representativo produce el prompt aprobado", () => {
  const current = visualPromptSnapshots();
  for (const [index, expected] of baseline.cases.entries()) {
    const actual = current[index];
    assert.ok(actual !== undefined);
    assert.equal(actual.id, expected.id);
    assert.equal(actual.kind, expected.kind, `caso ${expected.id}: kind`);
    assert.equal(
      actual.profileId,
      expected.profileId,
      `caso ${expected.id}: perfil`,
    );
    assert.equal(
      actual.profileVersion,
      expected.profileVersion,
      `caso ${expected.id}: versión de perfil`,
    );
    assert.equal(actual.reason, expected.reason, `caso ${expected.id}: motivo`);
    assert.equal(
      actual.format,
      expected.format,
      `caso ${expected.id}: formato`,
    );
    assert.equal(
      actual.reservedSpace,
      expected.reservedSpace,
      `caso ${expected.id}: espacio reservado`,
    );
    assert.deepEqual(
      actual.negativeGuidance,
      expected.negativeGuidance,
      `caso ${expected.id}: guía negativa`,
    );
    assert.equal(actual.prompt, expected.prompt, `caso ${expected.id}: prompt`);
    assert.equal(
      actual.promptHash,
      expected.promptHash,
      `caso ${expected.id}: hash`,
    );
  }
});

/**
 * La guía negativa del perfil sí nombra el descuento —para prohibir que se
 * dibuje—, así que la afirmación se hace sobre los datos que vienen del brief,
 * que es donde el texto comercial no puede aparecer.
 */
test("ningún dato del brief lleva texto comercial ni salto de línea", () => {
  for (const entry of baseline.cases) {
    if (entry.prompt === null) {
      continue;
    }
    assert.ok(!entry.prompt.includes("\n"), `caso ${entry.id}: salto de línea`);
    const payload = JSON.parse(entry.prompt) as {
      untrusted_data: unknown;
    };
    assert.doesNotMatch(
      JSON.stringify(payload.untrusted_data),
      /\$\s*\d|\d\s*%|\bdescuento\b|\b\d{1,2}[:.]\d{2}\b/iu,
      `caso ${entry.id}: texto comercial`,
    );
  }
});
