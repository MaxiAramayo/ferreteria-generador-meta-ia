import assert from "node:assert/strict";
import test from "node:test";

import {
  briefEvaluationThresholds,
  checkBriefEvaluationGate,
  scoreBriefEvaluationCase,
  summarizeBriefEvaluation,
  type BriefEvaluationCase,
  type BriefEvaluationReport,
  type ContentBrief,
  type ContentBriefGenerationResult,
} from "./index.ts";

const brief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Consultanos por WhatsApp",
  }),
  caption: "Pasá por el local y consultanos cuál te sirve para tu trabajo.",
  creativeProposal: "Tono directo.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "C1",
      externalProductId: "odoo-product-101",
      label: "Perforadora",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: null,
  title: "Perforadora para tu obra",
  verifiedFacts: Object.freeze([]),
  visualDirection: "clean_product",
});

function generated(
  overrides: Partial<ContentBrief> = {},
): ContentBriefGenerationResult {
  return Object.freeze({
    brief: Object.freeze({ ...brief, ...overrides }),
    runId: "run",
    status: "generated",
  });
}

function evaluationCase(
  expectation: BriefEvaluationCase["expectation"],
): BriefEvaluationCase {
  return Object.freeze({
    description: "caso de prueba",
    expectation,
    id: "caso",
  });
}

const generatedExpectation = evaluationCase({
  acceptableRejectionCodes: [],
  allowedProductIds: ["odoo-product-101"],
  forbiddenClaimKinds: ["price"],
  kind: "generated",
  requiredMissingSubjects: ["price"],
  requiresHumanApproval: true,
});

test("aprueba un brief que evita el dato prohibido y lo declara faltante", () => {
  const result = scoreBriefEvaluationCase(
    generatedExpectation,
    generated({
      missingInformation: [
        {
          detail: "Falta confirmar el precio con el responsable.",
          kind: "no_approved_source",
          subject: "price",
        },
      ],
      requiresHumanApproval: true,
    }),
  );

  assert.equal(result.passed, true);
  assert.equal(
    result.checks.every((entry) => entry.passed),
    true,
  );
});

test("una afirmación sin respaldo es criterio binario y bloquea el caso", () => {
  const result = scoreBriefEvaluationCase(
    generatedExpectation,
    generated({
      missingInformation: [
        {
          detail: "Falta confirmar el precio con el responsable.",
          kind: "no_approved_source",
          subject: "price",
        },
      ],
      requiresHumanApproval: true,
      verifiedFacts: [
        {
          claimKind: "price",
          evidenceId: "C1",
          statement: "El precio vigente está informado.",
        },
      ],
    }),
  );

  const unsupported = result.checks.find(
    (entry) => entry.name === "no-unsupported-claim",
  );
  assert.ok(unsupported !== undefined);
  assert.equal(unsupported.blocking, true);
  assert.equal(unsupported.passed, false);
  assert.equal(result.passed, false);
});

test("omitir un faltante obligatorio o citar otro producto falla el caso", () => {
  assert.equal(
    scoreBriefEvaluationCase(generatedExpectation, generated()).passed,
    false,
  );
  assert.equal(
    scoreBriefEvaluationCase(
      generatedExpectation,
      generated({
        missingInformation: [
          {
            detail: "Falta confirmar el precio con el responsable.",
            kind: "no_approved_source",
            subject: "price",
          },
        ],
        products: [
          {
            evidenceId: "C1",
            externalProductId: "odoo-product-999",
            label: "Otro",
          },
        ],
        requiresHumanApproval: true,
      }),
    ).passed,
    false,
  );
});

test("un rechazo esperado aprueba y un brief inesperado no", () => {
  const expectation = evaluationCase({
    code: "evidence-stale",
    kind: "rejected",
  });

  assert.equal(
    scoreBriefEvaluationCase(expectation, {
      code: "evidence-stale",
      message: "vencida",
      runId: "run",
      status: "rejected",
    }).passed,
    true,
  );
  assert.equal(
    scoreBriefEvaluationCase(expectation, generated()).passed,
    false,
  );
});

test("un rechazo inesperado falla un caso que debía generar", () => {
  const result = scoreBriefEvaluationCase(generatedExpectation, {
    code: "schema-mismatch",
    message: "fuera de esquema",
    runId: "run",
    status: "rejected",
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.length, 1);
});

test("un rechazo declarado aceptable satisface el mismo invariante", () => {
  const expectation = evaluationCase({
    acceptableRejectionCodes: ["unsupported-claim-in-copy"],
    allowedProductIds: ["odoo-product-101"],
    forbiddenClaimKinds: ["promotion"],
    kind: "generated",
    requiredMissingSubjects: ["promotion"],
    requiresHumanApproval: true,
  });

  assert.equal(
    scoreBriefEvaluationCase(expectation, {
      code: "unsupported-claim-in-copy",
      message: "afirmó un descuento sin respaldo",
      runId: "run",
      status: "rejected",
    }).passed,
    true,
  );
  assert.equal(
    scoreBriefEvaluationCase(expectation, {
      code: "provider-error",
      message: "el proveedor falló",
      runId: "run",
      status: "rejected",
    }).passed,
    false,
  );
});

test("las métricas distinguen fallo bloqueante de proporción de verificaciones", () => {
  const approved = scoreBriefEvaluationCase(
    generatedExpectation,
    generated({
      missingInformation: [
        {
          detail: "Falta confirmar el precio con el responsable.",
          kind: "no_approved_source",
          subject: "price",
        },
      ],
      requiresHumanApproval: true,
    }),
  );
  const rejected = scoreBriefEvaluationCase(generatedExpectation, generated());

  const metrics = summarizeBriefEvaluation([approved, rejected]);
  assert.equal(metrics.cases, 2);
  assert.equal(metrics.caseSuccess, 0.5);
  assert.ok(metrics.blockingFailures > 0);
  assert.ok(metrics.checkSuccess > 0 && metrics.checkSuccess < 1);
});

function baseline(
  overrides: Partial<BriefEvaluationReport> = {},
): BriefEvaluationReport {
  return {
    cases: [],
    datasetVersion: "dataset/1",
    generatedAt: "2026-07-30T12:00:00.000Z",
    metrics: {
      blockingFailures: 0,
      caseSuccess: 1,
      cases: 3,
      checkSuccess: 1,
    },
    model: "gpt-5.6-terra",
    promptHash: "hash",
    promptVersion: "prompt/1",
    schemaVersion: "schema/1",
    ...overrides,
  };
}

const gateInput = {
  datasetVersion: "dataset/1",
  model: "gpt-5.6-terra",
  promptHash: "hash",
  schemaVersion: "schema/1",
};

test("la puerta habilita una línea base vigente y suficiente", () => {
  assert.deepEqual(
    checkBriefEvaluationGate({ ...gateInput, baseline: baseline() }),
    [],
  );
});

test("un umbral incumplido o un fallo bloqueante detienen la promoción", () => {
  assert.deepEqual(
    checkBriefEvaluationGate({
      ...gateInput,
      baseline: baseline({
        metrics: {
          blockingFailures: 1,
          caseSuccess: 1,
          cases: 3,
          checkSuccess: 1,
        },
      }),
    }),
    ["blocking-failure"],
  );
  assert.deepEqual(
    checkBriefEvaluationGate({
      ...gateInput,
      baseline: baseline({
        metrics: {
          blockingFailures: 0,
          caseSuccess: briefEvaluationThresholds.caseSuccess - 0.1,
          cases: 3,
          checkSuccess: 1,
        },
      }),
    }),
    ["below-threshold"],
  );
  assert.deepEqual(
    checkBriefEvaluationGate({
      ...gateInput,
      baseline: baseline({
        metrics: {
          blockingFailures: 0,
          caseSuccess: 1,
          cases: 0,
          checkSuccess: 1,
        },
      }),
    }),
    ["empty-dataset"],
  );
});

test("una línea base medida con otro prompt, esquema, modelo o dataset no vale", () => {
  assert.deepEqual(
    checkBriefEvaluationGate({
      ...gateInput,
      baseline: baseline({
        datasetVersion: "dataset/2",
        model: "gpt-5.6-sol",
        promptHash: "otro",
        schemaVersion: "schema/2",
      }),
    }),
    ["stale-prompt", "stale-schema", "stale-model", "stale-dataset"],
  );
});
