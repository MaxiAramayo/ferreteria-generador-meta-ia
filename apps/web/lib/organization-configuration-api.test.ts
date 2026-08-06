import assert from "node:assert/strict";
import test from "node:test";

import type {
  GenerationPolicyResponse,
  OrganizationConfigurationResponse,
} from "@aramayo/contracts";

import {
  loadConfiguration,
  saveGenerationPolicy,
} from "./organization-configuration-api.ts";

const apiBaseUrl = "https://api.example.invalid/";

const configuration: OrganizationConfigurationResponse = Object.freeze({
  brand: Object.freeze({
    claim: "Todo para tu obra",
    handle: "@aramayo",
    id: "brand-1",
    name: "Aramayo",
    shortName: "Aramayo",
    themeId: "taller",
    version: 1,
  }),
  displayName: "Ferretería Aramayo",
  id: "organization-1",
  legalName: "Aramayo SRL",
  locations: Object.freeze([]),
  version: 1,
});

const generationPolicy: GenerationPolicyResponse = Object.freeze({
  enabled: true,
  generatedOrphanRetentionHours: 24,
  monthlyBudgetMicrousd: 20_000_000,
  organizationDailyAttemptLimit: 20,
  organizationId: "organization-1",
  originalRetentionDays: 90,
  referenceRetentionDays: 30,
  timeZone: "UTC",
  updatedAt: "2026-08-06T12:00:00.000Z",
  usage: Object.freeze({
    alertActive: false,
    committedMicrousd: 0,
    monthUtc: "2026-08",
    monthlyBudgetMicrousd: 20_000_000,
    organizationAttemptsRemaining: 20,
    reservedMicrousd: 0,
    settledMicrousd: 0,
    unconfirmedMicrousd: 0,
    userAttemptsRemaining: 8,
  }),
  userDailyAttemptLimit: 8,
  version: 1,
  warningThresholdPercent: 80,
});

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

test("un administrador carga política y uso en paralelo con la configuración", async (context) => {
  const paths: string[] = [];
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input): Promise<Response> => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    paths.push(path);
    if (path === "/auth/session") {
      return Promise.resolve(json({ actor: { roles: ["admin"] } }));
    }
    if (path === "/organization/configuration") {
      return Promise.resolve(json(configuration));
    }
    if (path === "/organization/generation-policy") {
      return Promise.resolve(json(generationPolicy));
    }
    return Promise.resolve(json({}, 404));
  };

  const loaded = await loadConfiguration(apiBaseUrl);

  assert.equal(loaded.kind, "ready");
  assert.equal(loaded.canEdit, true);
  assert.deepEqual(loaded.generationPolicy, generationPolicy);
  assert.deepEqual(paths.toSorted(), [
    "/auth/session",
    "/organization/configuration",
    "/organization/generation-policy",
  ]);
});

test("un rol de lectura no solicita el endpoint administrativo", async (context) => {
  const paths: string[] = [];
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input): Promise<Response> => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    paths.push(path);
    return path === "/auth/session"
      ? Promise.resolve(json({ actor: { roles: ["viewer"] } }))
      : Promise.resolve(json(configuration));
  };

  const loaded = await loadConfiguration(apiBaseUrl);

  assert.equal(loaded.kind, "ready");
  assert.equal(loaded.canEdit, false);
  assert.equal(loaded.generationPolicy, null);
  assert.ok(!paths.includes("/organization/generation-policy"));
});

test("un conflicto de versión queda tipado y no se presenta como guardado", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input): Promise<Response> => {
    const path = new URL(input instanceof Request ? input.url : input).pathname;
    return path === "/auth/csrf"
      ? Promise.resolve(json({ csrfToken: "csrf-test" }))
      : Promise.resolve(json({ message: "conflict" }, 409));
  };

  const saved = await saveGenerationPolicy(
    apiBaseUrl,
    generationPolicy,
    generationPolicy,
  );

  assert.deepEqual(saved, { kind: "conflict" });
});
