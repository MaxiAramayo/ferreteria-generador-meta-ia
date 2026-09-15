import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationRunResponse } from "@aramayo/contracts";

import {
  isGenerationRunResponse,
  requestGenerationCompositionEdit,
  requestGenerationEdit,
  shouldPollGenerationRun,
} from "./generation-run-api.ts";

function run(status: GenerationRunResponse["status"]): GenerationRunResponse {
  return {
    cancelledAt: null,
    completedAt: status === "completed" ? "2026-08-06T12:01:00.000Z" : null,
    contentBriefRunId: "brief-1",
    edit: null,
    format: "feed",
    id: "run-1",
    lineageRootId: "run-1",
    plan: null,
    progress: { discarded: 0, failed: 0, pending: 1, succeeded: 0, total: 1 },
    requestedAt: "2026-08-06T12:00:00.000Z",
    resolution: null,
    selectedAt: null,
    selectedByMembershipId: null,
    selectedVariantId: null,
    selectionVersion: 0,
    startedAt: null,
    status,
    subjectKind: "generic",
    usage: {
      cost: {
        imageInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        pricingVersion: null,
        reservedMicrousd: 0,
        settledMicrousd: 0,
        textInputTokens: 0,
        totalTokens: 0,
        unconfirmedMicrousd: 0,
      },
      estimatedCostUsd: null,
      totalTokens: 0,
    },
    variants: [
      {
        composition: null,
        failure: null,
        height: null,
        id: "variant-1",
        index: 0,
        mediaAssetId: null,
        source: "generated",
        status: "pending",
        width: null,
      },
    ],
  };
}

test("el cliente valida genealogía y sólo consulta lotes abiertos", () => {
  assert.equal(isGenerationRunResponse(run("pending")), true);
  assert.equal(shouldPollGenerationRun(run("pending")), true);
  assert.equal(shouldPollGenerationRun(run("running")), true);
  assert.equal(shouldPollGenerationRun(run("completed")), false);
  assert.equal(
    isGenerationRunResponse({ ...run("pending"), lineageRootId: 3 }),
    false,
  );
});

test("una edición factual envía el brief revalidado y la genealogía", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Promise.resolve(
      requests.length === 1
        ? new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
            headers: { "content-type": "application/json" },
            status: 200,
          })
        : new Response(
            JSON.stringify({ runId: "child-run", status: "pending" }),
            {
              headers: { "content-type": "application/json" },
              status: 202,
            },
          ),
    );
  };
  try {
    const result = await requestGenerationEdit("https://api.invalid/", {
      contentBriefRunId: "revalidated-brief",
      idempotencyKey: "edit-key",
      instruction: "Actualizar el precio con evidencia vigente.",
      kind: "factual",
      parentRunId: "parent-run",
      parentVariantId: "parent-variant",
      variants: 2,
    });

    assert.deepEqual(result, { kind: "accepted", runId: "child-run" });
    const body = JSON.parse(
      await (requests[1]?.clone().text() ?? "{}"),
    ) as Record<string, unknown>;
    assert.equal(body["contentBriefRunId"], "revalidated-brief");
    assert.equal(body["parentVariantId"], "parent-variant");
    assert.equal(requests[1]?.headers.get("idempotency-key"), "edit-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("un rechazo de negocio muestra su motivo y uno de forma se resume", async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { message: "El texto menciona un precio y el brief no lo sustenta." },
    { message: ["title must be longer than or equal to 4 characters"] },
  ];
  let call = 0;
  globalThis.fetch = (input) => {
    const url = new Request(input).url;
    if (url.endsWith("auth/csrf")) {
      return Promise.resolve(
        new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    }
    const body = responses[call] ?? {};
    call += 1;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 400,
      }),
    );
  };
  const input = {
    badge: null,
    callToAction: "Escribinos ya",
    idempotencyKey: "composition-key",
    layout: "marco-etiqueta",
    parentRunId: "parent-run",
    parentVariantId: "parent-variant",
    subtitle: null,
    title: "Tornillos a $ 25.000",
  };
  try {
    assert.deepEqual(
      await requestGenerationCompositionEdit("https://api.invalid/", input),
      {
        kind: "error",
        message: "El texto menciona un precio y el brief no lo sustenta.",
      },
    );
    assert.deepEqual(
      await requestGenerationCompositionEdit("https://api.invalid/", input),
      {
        kind: "error",
        message: "La API rechazó el pedido. Revisá los datos del formulario.",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cambiar de marco y textos envía el marco y el copy, sin instrucción", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return Promise.resolve(
      requests.length === 1
        ? new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
            headers: { "content-type": "application/json" },
            status: 200,
          })
        : new Response(
            JSON.stringify({ runId: "child-run", status: "pending" }),
            {
              headers: { "content-type": "application/json" },
              status: 202,
            },
          ),
    );
  };
  try {
    const result = await requestGenerationCompositionEdit(
      "https://api.invalid/",
      {
        badge: null,
        callToAction: "Escribinos ya",
        idempotencyKey: "composition-key",
        layout: "marco-etiqueta",
        parentRunId: "parent-run",
        parentVariantId: "parent-variant",
        subtitle: null,
        title: "Amoladora en oferta",
      },
    );

    assert.deepEqual(result, { kind: "accepted", runId: "child-run" });
    const body = JSON.parse(
      await (requests[1]?.clone().text() ?? "{}"),
    ) as Record<string, unknown>;
    assert.equal(body["kind"], "composition");
    assert.equal(body["layout"], "marco-etiqueta");
    assert.equal(body["title"], "Amoladora en oferta");
    assert.equal(body["callToAction"], "Escribinos ya");
    assert.equal(body["badge"], null);
    assert.equal(body["subtitle"], null);
    assert.equal("instruction" in body, false);
    assert.equal(
      requests[1]?.headers.get("idempotency-key"),
      "composition-key",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
