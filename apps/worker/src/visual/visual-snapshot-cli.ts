/**
 * Congela los prompts de los briefs representativos.
 *
 * El baseline se versiona en el repositorio porque es la evidencia de qué se le
 * pide al proveedor por cada campaña. Regenerarlo es deliberado: el diff del
 * JSON es lo que se revisa antes de aceptar un cambio de perfil, de
 * instrucciones o del constructor.
 *
 * No llama a ninguna API: el constructor es puro.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  visualPromptSnapshots,
  type VisualPromptSnapshotRow,
} from "./visual-prompt-snapshot-cases.ts";
import {
  visualPromptInstructionsHash,
  visualPromptVersion,
} from "./visual-prompt-builder.ts";

const baselinePath = fileURLToPath(
  new URL("./visual-prompt-baseline.json", import.meta.url),
);

function withoutRepeatedHeader(
  row: VisualPromptSnapshotRow,
): Readonly<Record<string, unknown>> {
  return {
    format: row.format,
    id: row.id,
    kind: row.kind,
    negativeGuidance: row.negativeGuidance,
    profileId: row.profileId,
    profileVersion: row.profileVersion,
    prompt: row.prompt,
    promptHash: row.promptHash,
    reason: row.reason,
    reservedSpace: row.reservedSpace,
  };
}

async function freeze(): Promise<void> {
  const rows = visualPromptSnapshots();
  const baseline = {
    cases: rows.map(withoutRepeatedHeader),
    instructionsHash: visualPromptInstructionsHash,
    promptVersion: visualPromptVersion,
  };
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, {
    encoding: "utf8",
  });
  process.stdout.write(
    `visual: ${String(rows.length)} casos congelados en ${baselinePath}\n`,
  );
}

await freeze();
