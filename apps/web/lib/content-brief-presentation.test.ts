import assert from "node:assert/strict";
import test from "node:test";

import type { ContentBrief, ContentBriefRunResponse } from "@aramayo/contracts";

import {
  contentBriefDisplay,
  missingInformationLabel,
  shouldPollContentBriefRun,
} from "./content-brief-presentation.ts";

const brief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: {
    kind: "whatsapp" as const,
    label: "Consultanos por WhatsApp",
  },
  caption: "Pasá por el local y consultanos cuál te sirve.",
  creativeProposal: "Tono directo.",
  missingInformation: [],
  objective: "product",
  products: [],
  requiresHumanApproval: false,
  subtitle: null,
  title: "Taladro percutor para tu obra",
  verifiedFacts: [
    {
      claimKind: "stock" as const,
      evidenceId: "C1",
      statement: "Hay unidades.",
    },
  ],
  visualDirection: "clean_product",
});

function run(
  overrides: Partial<ContentBriefRunResponse> = {},
): ContentBriefRunResponse {
  return {
    brief: null,
    cancelledAt: null,
    completedAt: null,
    evidence: [],
    id: "run-1",
    knowledgeStatus: "pending",
    locationId: null,
    model: null,
    promptVersion: null,
    rejection: null,
    request: "Necesito una pieza para promocionar taladros percutores.",
    requestedAt: "2026-07-31T12:00:00.000Z",
    schemaVersion: null,
    status: "pending",
    toolInvocations: [],
    usage: {
      estimatedCostUsd: null,
      latencyMilliseconds: 0,
      totalTokens: 0,
    },
    ...overrides,
  };
}

test("separa recuperación de generación mientras la ejecución sigue pendiente", () => {
  const retrieving = contentBriefDisplay(run());
  assert.equal(retrieving.phase, "retrieving");
  assert.equal(retrieving.canCancel, true);
  assert.equal(retrieving.canAccept, false);
  assert.equal(retrieving.canRetry, false);

  // Con conocimiento ya resuelto, lo que falta es la generación.
  const generating = contentBriefDisplay(run({ knowledgeStatus: "grounded" }));
  assert.equal(generating.phase, "generating");
  assert.equal(generating.canCancel, true);
});

test("una ejecución pendiente es la única que se vuelve a consultar", () => {
  assert.equal(shouldPollContentBriefRun(run()), true);
  assert.equal(
    shouldPollContentBriefRun(run({ brief, status: "generated" })),
    false,
  );
  assert.equal(shouldPollContentBriefRun(run({ status: "cancelled" })), false);
  assert.equal(shouldPollContentBriefRun(run({ status: "rejected" })), false);
});

test("un brief generado habilita aceptar y expone sus citas", () => {
  const evidence = Object.freeze({
    citationId: "C1",
    kind: "commercial" as const,
    observedAt: "2026-07-31T11:59:30.000Z",
    reference: "odoo:product:42",
  });
  const display = contentBriefDisplay(
    run({
      brief,
      completedAt: "2026-07-31T12:00:20.000Z",
      evidence: [evidence],
      knowledgeStatus: "grounded",
      status: "generated",
      usage: {
        estimatedCostUsd: 0.004_215,
        latencyMilliseconds: 820,
        totalTokens: 1_160,
      },
    }),
  );

  assert.equal(display.phase, "ready");
  assert.equal(display.canAccept, true);
  assert.equal(display.canCancel, false);
  assert.equal(display.title, brief.title);
  assert.equal(display.caption, brief.caption);
  assert.deepEqual(display.evidence, [evidence]);
  assert.deepEqual(display.facts, brief.verifiedFacts);
  assert.equal(display.usage.cost, "US$ 0.0042");
  assert.equal(display.usage.latency, "820 ms");
  assert.equal(display.usage.tokens, "1160 tokens");
});

test("una latencia de segundos deja de informarse en milisegundos", () => {
  const display = contentBriefDisplay(
    run({
      brief,
      status: "generated",
      usage: {
        estimatedCostUsd: null,
        latencyMilliseconds: 12_400,
        totalTokens: 0,
      },
    }),
  );

  assert.equal(display.usage.latency, "12.4 s");
  assert.equal(display.usage.cost, "Costo no informado");
});

test("un estado generado sin brief no habilita aceptar", () => {
  // El estado por sí solo no alcanza: lo que se acepta es el brief guardado.
  const display = contentBriefDisplay(
    run({ brief: null, status: "generated" }),
  );

  assert.equal(display.canAccept, false);
});

test("los faltantes viajan aparte del copy y conservan su motivo", () => {
  const display = contentBriefDisplay(
    run({
      brief: {
        ...brief,
        missingInformation: [
          {
            detail: "El precio consultado tenía más de 24 horas.",
            kind: "stale_observation",
            subject: "price",
          },
        ],
        requiresHumanApproval: true,
      },
      status: "generated",
    }),
  );

  assert.equal(display.requiresHumanApproval, true);
  assert.deepEqual(display.missingInformation.map(missingInformationLabel), [
    "Falta precio: el dato consultado está vencido.",
  ]);
});

test("un rechazo muestra su motivo y habilita reintentar, no aceptar", () => {
  const display = contentBriefDisplay(
    run({
      rejection: {
        code: "evidence-stale",
        message: "La evidencia consultada está vencida.",
      },
      status: "rejected",
    }),
  );

  assert.equal(display.phase, "rejected");
  assert.equal(display.statusLabel, "La evidencia consultada está vencida.");
  assert.equal(display.canRetry, true);
  assert.equal(display.canAccept, false);
});

test("una cancelación deja claro que el resultado no quedó vigente", () => {
  const display = contentBriefDisplay(
    run({ cancelledAt: "2026-07-31T12:00:10.000Z", status: "cancelled" }),
  );

  assert.equal(display.phase, "cancelled");
  assert.equal(display.canRetry, true);
  assert.equal(display.canAccept, false);
  assert.match(display.statusLabel, /no quedó vigente/u);
});

test("el pedido original encabeza la ejecución para poder reintentarlo igual", () => {
  const display = contentBriefDisplay(run({ status: "cancelled" }));

  assert.equal(
    display.headline,
    "Necesito una pieza para promocionar taladros percutores.",
  );
});
