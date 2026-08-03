import assert from "node:assert/strict";
import test from "node:test";

import {
  decideVisualInput,
  visualInputLimits,
  type VisualInputCandidate,
  type VisualInputDecision,
} from "./index.ts";

const organizationId = "org-aramayo";

function candidate(
  overrides: Partial<VisualInputCandidate["inspection"]> = {},
  rest: Partial<Omit<VisualInputCandidate, "inspection">> = {},
): VisualInputCandidate {
  return Object.freeze({
    inspection: Object.freeze({
      backgroundUniformity: 0.9,
      byteSize: 400_000,
      height: 1600,
      mimeType: "image/jpeg",
      width: 1200,
      ...overrides,
    }),
    ownerOrganizationId: organizationId,
    role: "product_photo" as const,
    ...rest,
  });
}

function rejectionOf(decision: VisualInputDecision): string {
  assert.equal(decision.status, "rejected");
  return decision.rejection.code;
}

test("una foto propia y suficiente se acepta", () => {
  const decision = decideVisualInput(candidate(), organizationId);
  assert.equal(decision.status, "accepted");
  assert.deepEqual(decision.advisories, []);
});

test("una foto de otra organización se rechaza antes de mirarla", () => {
  const decision = decideVisualInput(
    candidate({ height: 10, width: 10 }, { ownerOrganizationId: "org-ajena" }),
    organizationId,
  );
  // Se rechaza por dueño y no por resolución, aunque también incumpla la medida.
  assert.equal(rejectionOf(decision), "organization-mismatch");
});

test("un tipo que no sirve de referencia se rechaza con su corrección", () => {
  const decision = decideVisualInput(
    candidate({ mimeType: "image/svg+xml" }),
    organizationId,
  );
  assert.equal(rejectionOf(decision), "type-not-allowed");
  assert.equal(decision.status, "rejected");
  assert.match(decision.rejection.correction, /JPEG o PNG/u);
});

test("una foto sin resolución explica cuánto le falta", () => {
  const decision = decideVisualInput(
    candidate({ height: 400, width: 300 }),
    organizationId,
  );
  assert.equal(rejectionOf(decision), "resolution-insufficient");
  assert.equal(decision.status, "rejected");
  assert.match(decision.rejection.reason, /300 px/u);
  assert.match(
    decision.rejection.correction,
    new RegExp(String(visualInputLimits.shortestSideMinimum), "u"),
  );
});

test("una tira panorámica se rechaza por proporción", () => {
  const decision = decideVisualInput(
    candidate({ height: 600, width: 4000 }),
    organizationId,
  );
  assert.equal(rejectionOf(decision), "aspect-ratio-extreme");
});

test("el límite de proporción es inclusivo", () => {
  const decision = decideVisualInput(
    candidate({ height: 600, width: 1800 }),
    organizationId,
  );
  assert.equal(decision.status, "accepted");
});

test("un fondo cargado avisa en lugar de rechazar la foto de producto", () => {
  const decision = decideVisualInput(
    candidate({ backgroundUniformity: 0.2 }),
    organizationId,
  );
  assert.equal(decision.status, "accepted");
  assert.equal(decision.advisories[0]?.code, "background-busy");
});

test("el fondo cargado no se avisa cuando la foto es de contexto", () => {
  const decision = decideVisualInput(
    candidate({ backgroundUniformity: 0.2 }, { role: "store_context" }),
    organizationId,
  );
  assert.equal(decision.status, "accepted");
  assert.deepEqual(decision.advisories, []);
});

test("una foto chica pero suficiente se acepta sin avisos", () => {
  // Es la medida de las fotos reales de la gata: 960×1280 desde el teléfono.
  const decision = decideVisualInput(
    candidate({ height: 1280, width: 960 }),
    organizationId,
  );
  assert.equal(decision.status, "accepted");
  assert.deepEqual(decision.advisories, []);
});
