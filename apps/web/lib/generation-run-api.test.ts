import assert from "node:assert/strict";
import test from "node:test";

import type { GenerationRunResponse } from "@aramayo/contracts";

import {
  isGenerationRunResponse,
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
