import assert from "node:assert/strict";
import test from "node:test";

import {
  loadRecurringStoryWorkspace,
  saveRecurringStoryRule,
} from "./recurring-story-api.ts";

const apiBaseUrl = "https://api.example.invalid/";
const rule = {
  approvalPolicy: "human-each-cycle",
  effectiveFrom: "2026-09-08T11:30:00.000Z",
  id: "rule-1",
  leadTimeMinutes: 120,
  localTime: "08:30",
  locationId: "location-1",
  name: "Apertura",
  status: "active",
  timeZone: "America/Argentina/Cordoba",
  version: 1,
  weekdays: [1, 2, 3, 4, 5, 6],
};
const workspace = {
  canUseAutomaticApproval: true,
  locations: [
    {
      addressLine: "Rivadavia 673",
      city: "Frías",
      id: "location-1",
      isActive: true,
      name: "Sucursal Rivadavia",
      openingHours: "Lun a sáb · 08:30 a 13:00",
      province: "Santiago del Estero",
      timeZone: "America/Argentina/Cordoba",
      version: 2,
    },
  ],
  rules: [rule],
};

test("carga reglas y fuentes de sucursal tipadas", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () => Promise.resolve(Response.json(workspace));

  const result = await loadRecurringStoryWorkspace(apiBaseUrl);

  assert.equal(result.kind, "ready");
  assert.equal(result.workspace.locations[0]?.version, 2);
  assert.equal(result.workspace.rules[0]?.approvalPolicy, "human-each-cycle");
});

test("guarda con CSRF e idempotencia sin enviar una orden de publicación", async (context) => {
  const originalFetch = globalThis.fetch;
  const calls: Readonly<{ headers: Headers; path: string }>[] = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ headers: new Headers(init?.headers), path: url.pathname });
    return Promise.resolve(
      url.pathname === "/auth/csrf"
        ? Response.json({ csrfToken: "csrf-safe" })
        : Response.json({ rule, status: "created" }),
    );
  };

  const result = await saveRecurringStoryRule(apiBaseUrl, {
    approvalPolicy: "human-each-cycle",
    effectiveFromLocalDate: "2026-09-08",
    idempotencyKey: "recurring-rule-123",
    leadTimeMinutes: 120,
    localTime: "08:30",
    locationId: "location-1",
    name: "Apertura",
    weekdays: [1, 2, 3, 4, 5, 6],
  });

  assert.equal(result.kind, "saved");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/auth/csrf", "/scheduling/recurring-stories"],
  );
  const ruleCall = calls[1];
  assert.ok(ruleCall);
  assert.equal(ruleCall.headers.get("idempotency-key"), "recurring-rule-123");
  assert.equal(ruleCall.headers.get("x-csrf-token"), "csrf-safe");
});

test("un contrato incompleto falla cerrado", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () => Promise.resolve(Response.json({ rules: [] }));

  assert.deepEqual(await loadRecurringStoryWorkspace(apiBaseUrl), {
    kind: "error",
    message: "La API devolvió reglas recurrentes que el panel no puede usar.",
  });
});
