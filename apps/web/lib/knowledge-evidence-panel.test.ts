import assert from "node:assert/strict";
import test from "node:test";

import { knowledgeEvidenceDisplay } from "./knowledge-evidence-presentation.ts";

const citation = Object.freeze({
  citationId: "K1",
  documentTitle: "Horarios aprobados",
  effectiveFrom: "2026-07-29T12:00:00.000Z",
  effectiveUntil: null,
  fragment: "La casa central atiende de lunes a viernes de 8 a 12.",
  score: 0.91,
  sourceKey: "operacion.horarios",
  sourceOwner: "Responsable de negocio",
  version: 2,
});

test("separa explícitamente texto propuesto y fuente recuperada", () => {
  const display = knowledgeEvidenceDisplay({
    citations: [citation],
    proposedText: "La casa central abre de lunes a viernes.",
    status: "grounded",
  });

  assert.equal(display.mode, "grounded");
  assert.equal(
    display.proposedText,
    "La casa central abre de lunes a viernes.",
  );
  assert.deepEqual(display.citations, [citation]);
});

test("información faltante bloquea la propuesta y conserva conflictos", () => {
  const display = knowledgeEvidenceDisplay({
    citations: [citation],
    missingInformation: ["conflicting-evidence"],
    status: "missing_information",
  });

  assert.equal(display.mode, "missing_information");
  assert.deepEqual(display.messages, [
    "Las fuentes recuperadas se contradicen y requieren revisión.",
  ]);
  assert.deepEqual(display.citations, [citation]);
  assert.equal("proposedText" in display, false);
});
